#!/usr/bin/env node
/**
 * The Open list must be readable by something other than the person who wrote it.
 *
 * ## What was measured
 *
 * `docs/progress.md` ends with an `### Open` list of residuals. Three separate
 * rounds have now found an entry in it that had stopped meaning anything:
 *
 * | entry | state when it was read |
 * | --- | --- |
 * | `--stdin` has no automatic invoker | **closed eleven passes earlier** by finding 150, and nothing noticed |
 * | the `commits` count gate is still to be done | the document publishes **no `commits` count at all** (finding 159) |
 * | six scripts in run #174 were never read individually | the job that ran them no longer runs a suite; both cold aggregates pass on a cold tree (finding 159) |
 *
 * The first one was corrected by hand and its correction says what the problem is:
 * *"The line above stood for eleven passes after that, because nothing reads an
 * 'open' list."* Writing that sentence did not give the list a reader, and two more
 * stale entries accumulated behind it.
 *
 * ## What this guard can and cannot check
 *
 * It cannot check whether an entry is *still true* -- that needs the measurement the
 * entry is about, and a script cannot guess it. What it can check is that each entry
 * **says which it is**:
 *
 * - `closed` -- struck through, with the finding that closed it named (`~~...~~`
 *   plus `Closed by finding N`), so a reader knows the line is history and not work;
 * - `open` -- carries `[open: <reason>]`, and the reason has to be a sentence,
 *   because "still open" is not a reason and the entry below it is the evidence.
 *
 * That is the same trade finding 153 made for its exemption table: the check can
 * refuse a placeholder, and it cannot refuse a wrong-but-fluent sentence. Stated
 * here rather than left to look like more than it is.
 *
 * ## Two populations, and the round that found them apart (finding 467)
 *
 * A round's record has an `item` column, and a residual can live there with **no entry
 * behind it** -- four did, the only P1 in the log among them, for six rounds. The stamp
 * could not see it: its number is arithmetic over the entries below it, computed by this
 * guard, so a residual that is not an entry is not a residual to the number. The newest
 * record's rows must now quote an entry (twenty characters of the row, marks removed,
 * appear inside one), because a paraphrase is a sentence with one reader and the entry is
 * the other (finding 468).
 *
 * Older records are not judged: a record is frozen and nothing appends to it, so a rule
 * that judged them would demand a repair the corpus forbids.
 *
 * ## The rule that was already here
 *
 * v3.65 also added an arm resolving a closure's `Closed by finding N` against the audit,
 * on the reading that the citation had only ever been checked for its shape. It had not:
 * `check-citations.mjs` resolves every `finding N` in the documentation and refuses one
 * that names nothing, and it has done since finding 205. The arm was removed in the same
 * round, and the only reason the round noticed is that its own write-up cited a number
 * with no heading as an example of the defect (finding 469).
 *
 * ## Subject
 *
 * The section is located by its **heading**, not by any line that mentions the word
 * "open" -- finding 155's bug, where the guard read the headline table because a row
 * in it cross-referenced the section.
 *
 * Every section with that heading is read, not the first one. That was finding 162:
 * this guard located its subject with `findIndex`, a pass appended a second `### Open`
 * section, and the new list had no reader -- the count it printed did not move and
 * nothing in the output said a second list existed. A document that gains a list must
 * gain a reader for it, and the only way to hold that is to read all of them.
 *
 * `--doc <path>` reads a different document, so the fixtures in
 * `packages/core/test/check-open-list.test.ts` can drive the script itself. Which
 * sections are read is not a predicate, so the copy-the-regexes route those tests use
 * for the two judges could not have answered this question.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { progressCorpus } from './docs-corpus.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DOCS = [
  // Three lists, and they answer three different questions.
  //
  // `## Open` is the **live** list: what is not done now. There is one, in the index, and
  // it is maintained by hand -- an entry is added when the round that raises it declines
  // to close it, and **deleted** when something closes it.
  //
  // `### Left open` is a **record**: what that round left undone, at that round. There are
  // fifty-seven of them and none is updated afterwards. The heading used to read `### Open`
  // in both places, which is how a reader grepping for what is open got 58 answers, one of
  // which was current (finding 207). Renaming was the repair; a rule in a comment would
  // have left the names lying.
  //
  // `## Closed` is the **record of closures**, and it exists because the live list stopped
  // fitting: until v3.111 an entry was struck in place, so `## Open` carried its own history
  // and grew by it -- **65,544 of 98,927 bytes** by v3.110, two thirds of the list a reader
  // opens to find out what is still open. The index that holds it had grown past the size a
  // new volume can be born at, so the size of a list of closures was the reason the log could
  // not grow (finding 568).
  //
  // The guard checks the same two things of all three: that each entry says which it is, and
  // that an open entry gives a reason long enough to be one. It cannot check that any list is
  // *current*, and does not pretend to. What the split adds is one refusal per side -- a strike
  // in the live list, an unstruck bullet in the record -- and those two are the whole reason
  // the record is a file rather than a section that is merely long today.
  //
  //
  // The row arm below runs **after** this walk rather than inside it, and that is what makes the
  // list it compares against whole: a row may name a residual the round closed, and the closure
  // is in the second of these two files. An arm that ran per document would see only the entries
  // of the documents read so far, and its verdict would depend on their order.
  { path: 'docs/progress.md', headings: ['## Open', '### Left open'] },
  { path: 'docs/progress/closed.md', headings: ['## Closed'] },
];

/**
 * Where to read a document from, and what to call it in the diagnostics.
 *
 * The label follows the source: a message that said `docs/progress.md` while reading a
 * test's temp file would name a file it did not read, which is the kind of diagnostic
 * this repository has had to repair more than once.
 */
function source(rel) {
  const i = process.argv.indexOf('--doc');
  if (i === -1) return { label: rel, path: resolve(ROOT, rel) };
  const actual = resolve(process.argv[i + 1]);
  return { label: actual, path: actual };
}

/**
 * What a closed entry has to say, and why the old rule did not make it say that.
 *
 * The docstring above promises "struck through, **with the finding that closed it
 * named**". The regex was `/~~|Closed by finding \d+/`, which is satisfied by a
 * strikethrough alone -- so half the promise was unenforced, and eleven of the twenty
 * closed entries could not have satisfied it anyway: their citation wraps
 * (`**Closed by\nfinding 170.**`) and a pattern without `\s+` cannot see across the
 * break. A rule stated in prose and a rule enforced in code had drifted, which is the
 * defect this whole guard exists to catch in other people's lists.
 *
 * So the citation is required, and there are three authorities a closure can have:
 *
 * 1. a **finding** (`Closed by finding 170`), which is the common case;
 * 2. a **round** (`Closed by Pass 15`), because this log names rounds in two eras and
 *    a round is what closes most things;
 * 3. **explicitly not a finding** (`Closed without a finding: ...`, `Closed in this
 *    pass ...`), for closures whose authority is a measurement or a fix outside this
 *    tree -- and the sentence after it has to be long enough to be one.
 *
 * `[^.]{0,120}?` keeps the citation in the closure's own sentence: "Closed by the
 * workflow. Finding 170 later found something else." must not read as a citation.
 *
 * ## The headline, not the whole entry (finding 458)
 *
 * A strikethrough was looked for **anywhere** in an entry, and that is not what a closed
 * entry is: two live entries quote a struck sentence *inside* themselves -- a sub-item
 * that a later round closed while the entry around it stayed open -- and both of them
 * were therefore counted as closed. Their own reasons were never read: not for length,
 * not for being a copy of another one. The count the currency stamp has to state is what
 * exposed it, because the stamp said thirteen and this guard said eleven, and the
 * difference was two entries neither of them could have named.
 *
 * An entry is closed when its **headline** is struck, which is what "struck through"
 * means of a bullet: the first line is the claim, and the rest of the bullet is what the
 * claim is about.
 */
const CLOSED = /~~/;
const CITED = /(?:Closed|Narrowed|Retracted)\b[^.]{0,120}?\b(?:finding\s+\d+|Pass\s+\d+|v\d+\.\d+)/;
const UNCITED = /(?:Closed without a finding|Closed in this pass)[\s\S]{40,}/;

/**
 * The entry's own reason, and why it is the **last** marker rather than the first.
 *
 * An entry may quote a marker inside itself -- the shipped list has two whose bodies carry a
 * sub-item's `~~[open: ...]~~ Closed by finding N` -- and the entry's own reason comes after
 * it, because the quote is history and the reason is the claim. Reading the first marker gave
 * the quoted sub-item's reason to the entry: fifteen characters of history judged as if it
 * were the reason a reader is being asked to act on (finding 458).
 */
const OPEN = /\[open:\s*([^\]]*)\]/g;

/**
 * The last reason marker in an entry: the one that carries the entry's own claim.
 *
 * @param {string} item one bullet, continuation lines included
 * @returns {RegExpMatchArray | null}
 */
function reasonOf(item) {
  const all = [...item.matchAll(OPEN)];
  return all.length === 0 ? null : all[all.length - 1];
}

/**
 * Whether the reason a bullet was read from is itself struck through.
 *
 * ## The mirror finding 458's repair left open
 *
 * The closure test looks at the **headline**, and that was right: a strikethrough anywhere in
 * an entry closed two live entries that merely quoted one. But the same narrowing made the
 * reason invisible in the other direction -- a bullet whose own reason is struck, over a
 * headline that is not, was read as an entry asking for work, and its reason was read for
 * length and for being a copy of another one and for nothing else.
 *
 * Two entries in the shipped list were in that state, and both of them end with the finding
 * that closed them, so the file said one thing twice -- closed -- while the guard and the
 * count it defends said the other. The shape that would have been right is older than the
 * defect: round v2.44 strikes the headline *and* the reason and puts the closure after them.
 *
 * Both spellings are read, because the shipped list writes the marker inside backticks and a
 * fixture written by hand often does not.
 *
 * @param {string} item one bullet, continuation lines included
 * @param {RegExpMatchArray} marker the reason `reasonOf` returned
 */
function struckReason(item, marker) {
  const left = item.slice(Math.max(0, marker.index - 3), marker.index);
  const start = marker.index + marker[0].length;
  const right = item.slice(start, start + 3);
  return /(?:~~|~~`)$/.test(left) && /^(?:~~|`~~)/.test(right);
}

/**
 * Text with the marks taken out, so a quotation can be compared with the thing it quotes.
 *
 * A record's `item` cell is the only handle a reader has on a residual: the entry above is in
 * another document, and the row is a sentence about it. When the row is the entry's own words,
 * `grep` finds both; when it is a paraphrase, the row is the only place those words exist --
 * which is finding 463's argument (a title is an exact string) applied to a cell instead of a
 * heading.
 *
 * Emphasis, code ticks and quotes are formatting rather than words, so they are removed;
 * whitespace is collapsed and the case is dropped, for the same reason. What is left is what a
 * person comparing the two side by side would call the same sentence.
 */
function plain(text) {
  return text
    .replace(/\*\*|~~|`/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.…]+$/, '')
    .toLowerCase();
}

/**
 * The live list's currency stamp: which round read it, and how many entries it found open.
 *
 * ## Why a stamp, and what it is not
 *
 * v3.61 closed three of this list's entries and struck none of them. The list then said
 * "open" about a page that had been made a page (finding 451), about a flag whose second
 * half had been read (finding 446), and about a creation path that had been paid for by a
 * real push (finding 455) -- and one more `[open: ...]` sat *inside* an entry that had been
 * struck through, where neither a reader nor this guard looks.
 *
 * That is the fourth time this list has carried a stale entry, and the earlier repairs all
 * had the same shape: a sentence was written about the defect and no reader was given to the
 * list. This one is not another sentence. It is an arithmetic obligation at the top of the
 * list: the stamp names the round that read it and the number of entries it found open, this
 * guard recomputes the number from the section, and the round must be the newest one in the
 * corpus -- so a round that writes itself up without opening this file turns the gate red.
 *
 * It cannot check that a surviving entry is still *true*. Nothing in this tree can: that
 * needs the measurement the entry is about. What it can check is that somebody stood in
 * front of all of them this round and counted, and that is the difference between the three
 * stale entries above and a list that is merely wrong.
 */
const STAMP = /Checked at (v\d+\.\d+): \*\*(\d+)\*\* (?:entry|entries) open/g;

/** The heading that opens a round in the corpus: `## v3.62 -- ...`. */
const ROUND = /^## (v(\d+)\.(\d+))\b/;

/**
 * Which spelling of the two names a heading is, and why the exact string was not enough.
 *
 * `sections()` used to match the heading with `wanted.has(trimmed)`, so a heading that gained a
 * suffix stopped being read -- silently, with the count unchanged and nothing in the output
 * saying a list existed. That is finding 162's shape, one level down: the guard was fixed to
 * read *every* section with the heading, and the document then changed the heading.
 *
 * It happened at v3.45. From that round on, a round's record is a **table**:
 *
 * ```
 * ### Left open, in the order the goal is reached
 * | priority | item | state | next step |
 * ```
 *
 * Nineteen of them, in volumes 10, 11 and 12, and none had a reader: the guard matched
 * `### Left open` exactly, so it read 163 bullet records and not one of the nineteen tables.
 * The rows were not entries, so nothing was miscounted -- what was missing was the statement
 * that they were not judged, and a refusal for any third spelling.
 *
 * So there are two known spellings and one refusal:
 *
 * - `## Open` -- the live list, read as entries;
 * - `### Left open` -- a record, read as entries;
 * - `### Left open, <anything>` -- a record in table form: its rows are counted, its shape is
 *   checked, and the summary says its rows were not judged;
 * - anything else beginning `## Open` or `### Left open` -- refused, because a document that
 *   renames a list has moved it out of its reader's reach and must say so.
 */
function spellingOf(heading) {
  if (heading === '## Open') return { kind: 'live', form: 'entries' };
  if (heading === '### Left open') return { kind: 'record', form: 'entries' };
  if (/^### Left open,/.test(heading)) return { kind: 'record', form: 'table' };
  // The record of closures. Its own kind rather than `record`, because the two are asked
  // different questions: a round's record may hold an entry that is still open (a round can
  // leave something undone), and this one may not -- everything here is closed, or it is
  // work filed as history and nobody will ever do it.
  if (heading === '## Closed') return { kind: 'closed', form: 'entries' };
  return null;
}

/**
 * The token that names an entry, and the round that found the lists needing one (finding 570).
 *
 * ## What the split was held by, and what it was not
 *
 * v3.111 moved forty-eight closures out of the live list into a file, and checked the move once,
 * by hand: seventy-six entries in, seventy-six out, twenty-eight plus forty-eight. That is a
 * measurement of one edit, and it decays the moment the next edit is made -- the same decay every
 * published count in this repository has, with a worse consequence, because the thing that decays
 * here is the answer to "is anything open that nobody is told about".
 *
 * Both of the split's refusals read a single bullet. Neither compares the two files, so the hole
 * between them is a bullet that satisfies both: an entry **copied** into the record struck and
 * left in the live list unstruck is history where history belongs and work where work does. One
 * residual, two answers, and no rule that could tell -- the two copies are different text by
 * construction, so nothing textual can pair them.
 *
 * ## Identity, and what it makes checkable
 *
 * Every entry of the two lists carries an id: `O-001`, three digits, right after the bullet's
 * `- ` and outside every mark the headline carries -- `- O-001 · **The claim.**`. The two lists
 * share **one** id space, and the space is **dense** -- 1..N, N the number of entries the two
 * files hold together. Three defects are refused by that alone:
 *
 * | defect | what it looks like |
 * | --- | --- |
 * | a copy | one id in two files: `O-002` in `## Open` and in `## Closed` |
 * | a deletion | a hole: the ids run to forty and thirty-nine entries are present |
 * | an invented id | the same hole, from the other side: a new entry that took a number already spent |
 *
 * And the arithmetic that used to be a convention becomes the only thing that keeps the set
 * legal: **a new entry takes one more than the highest id the two lists hold**, because any other
 * number leaves a hole. The round that raises a residual no longer has to remember the rule; it
 * has to satisfy the set.
 *
 * ## What an id cannot say, stated rather than left to look like more
 *
 * It cannot say the text is the same entry. A closure can arrive in the record carrying the id of
 * an entry whose words were rewritten, and no reading of two files can tell that from a closure:
 * the entry it replaced is gone, and the id is all that is left of it. Nor can it see a rename
 * (`O-007` closed by an entry that was `O-007` all along, saying something else). What it makes
 * impossible is the **silent** version of either, which is the version that loses work: the id is
 * what a reader greps, and a grep that finds it in `## Closed` leads to the sentence that closed
 * it, in the round's own words.
 *
 * ## Why three digits, and why the width is refused rather than padded
 *
 * The space ends at 999. A fixed width is what makes a prefix grep safe -- `O-100` must not match
 * the front of `O-1000` -- and padding to the size of today's list would make every id a different
 * width as the list grows, which is a token nobody can grep. An id that is not three digits is
 * refused with its own diagnostic rather than read as no id at all, because "this entry has no id"
 * about an entry that has one is a message that sends a reader to the wrong place.
 */
const ID = /^O-(\d+)\b/;

/**
 * The id a headline carries, or `null` when it carries none.
 *
 * The leading marks are tolerated rather than required, because the position of the id is a rule
 * about reading and not about markup: a headline may start with `**` (a bold claim), with `~~**`
 * (a struck claim, which is the common shape in the record) or with `**~~` (the one entry whose
 * strike sits inside its bold), and all three carry the same token in the same place. A pattern
 * written for one of them would stop reading the id of an entry whose author wrote it the other
 * way, and the refusal it would produce -- "this entry has no id" -- would be false.
 *
 * @param {string} headline the entry's first line
 * @returns {{ token: string, digits: string } | null}
 */
function idOf(headline) {
  const lead = headline.replace(/^-\s+/, '').replace(/^[~*`\s]+/, '');
  const match = ID.exec(lead);
  return match === null ? null : { token: match[0], digits: match[1] };
}

/** The token for a number, so one width is written in one place. */
function idToken(n) {
  return `O-${String(n).padStart(3, '0')}`;
}

/** A heading that begins with one of the list names without being a spelling this guard reads. */
const NEARLY = /^#{2,3} (?:Open|Left open|Closed)\b/;

/**
 * The four columns a table-form record names, and the reason each one has to be there.
 *
 * The heading makes a promise -- `Left open, in the order the goal is reached` -- and the
 * summary makes a second one: that these rows were **not judged**. A reader who wants to judge
 * them, or to check what a round left undone, needs the same four cells for every row: what
 * priority the residual had, what it was, what the round's own account of it is, and what the
 * next step is. Nineteen records use exactly these four, in this order, and 147 rows fill them.
 *
 * So the names are required rather than assumed. Finding 463 is the argument: a heading that
 * gained a comma moved nineteen records out of this guard's reach, and a column that stops
 * being called `state` moves the same records out of a reader's grep -- while the count of
 * "rows nobody judged" goes up by nothing. The check costs one `includes` per column.
 */
const COLUMNS = ['priority', 'item', 'state', 'next step'];

/** The cells of one pipe line, with the outer pipes removed and each cell trimmed. */
function cellsOf(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * How many rows a table-form record holds, or the shape defect that stops the count meaning
 * anything.
 *
 * v3.63 counted `lines.filter(/^\s*\|/)`, which is every pipe line -- and a markdown table
 * carries two lines that are not rows: the header, which names the columns, and the rule,
 * which draws the line under it. Nineteen records of 147 rows were reported as 185, and the
 * sentence that said those rows were not judged overstated its subject by 38 (finding 464).
 *
 * Worse than the arithmetic: that number was also the test for `holds no table`. A header and
 * a rule are two pipe lines, so `rows === 0` was unreachable for any table a person would
 * write, and a record that names its columns and stops was accepted and reported as `2 row(s)`.
 *
 * The count is therefore taken from the record -- header, rule, then rows -- and each of the
 * three is checked, because a count of rows in a table whose columns do not line up is a count
 * of lines. The `state` cell is still **not** judged: it is prose, and the nineteen records
 * predate any vocabulary. That limit is stated in the summary rather than implied here.
 */
function tableShape(lines) {
  const pipes = lines.filter((line) => /^\s*\|/.test(line));
  if (pipes.length === 0) {
    return {
      rows: 0,
      problem: 'is written in table form and holds no table, so its rows are neither counted nor judged',
    };
  }
  const header = cellsOf(pipes[0]);
  if (pipes.length < 2 || !/^\s*\|[\s:|-]+\|\s*$/.test(pipes[1])) {
    return {
      rows: 0,
      problem:
        `names ${String(header.length)} column(s) and draws no rule under them, so its header is a ` +
        'line a reader cannot tell from a row',
    };
  }
  const missing = COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return {
      rows: 0,
      problem:
        `names ${header.join(' | ')} and not ${missing.join(', ')}, so a reader who looks for the ` +
        'column a record of residuals has kept since v3.45 finds nothing',
    };
  }
  const rows = pipes.slice(2);
  if (rows.length === 0) {
    return {
      rows: 0,
      problem:
        'holds a header and no row, so there is nothing for a reader to be told was not judged',
    };
  }
  const stateAt = header.indexOf('state');
  for (const row of rows) {
    const cells = cellsOf(row);
    if (cells.length !== header.length) {
      return {
        rows: 0,
        problem:
          `has ${String(cells.length)} cell(s) under a header that names ${String(header.length)}, ` +
          `so every cell after the short one sits in the wrong column: ${row.trim().slice(0, 70)}`,
      };
    }
    // The one thing about the state cell that is mechanical. Its content is prose -- 147 readings
    // from 78 distinct values, a median of 75 characters (finding 466) -- so a gate that judged
    // it would be judging prose. An **empty** cell is different: the column exists, the record
    // promised a state for every residual, and a reader who finds nothing there has to derive
    // what the round thought. Not one of the 147 is empty, so this is a floor and not a repair.
    if (cells[stateAt] === '') {
      return {
        rows: 0,
        problem:
          'has a row whose `state` cell is empty, so the one column that says what became of a ' +
          `residual says nothing: ${row.trim().slice(0, 70)}`,
      };
    }
  }
  return { rows: rows.length, problem: null, rowLines: rows };
}

/**
 * Every section whose heading is one of `headings`, in document order, with its span.
 *
 * A deeper heading inside a section (`#### x`) stays in it; a heading of the same
 * level or shallower ends it. That is the rule the single-section version used, and it
 * is kept so the two sources of truth -- this scan and the document's own structure --
 * cannot drift apart on what "the section" means.
 *
 * The span is returned rather than only the lines because two spellings make nesting
 * possible in a way one spelling did not: a `### Left open` inside a `## Open` is two
 * sections whose entry counts overlap, and a guard that reported `2 section(s)` without
 * saying so would be publishing a number it cannot defend.
 */
function sections(doc, headings) {
  const wanted = new Set(headings);
  const lines = doc.split('\n');
  const heads = [];
  for (let index = 0; index < lines.length; index += 1) {
    const level = (/^#+/.exec(lines[index]) ?? [''])[0].length;
    const trimmed = lines[index].trim();
    if (level > 0 && (wanted.has(trimmed) || spellingOf(trimmed) !== null)) {
      heads.push({ index, level, heading: trimmed });
    }
  }
  return heads.map((head) => {
    let end = lines.length;
    for (let j = head.index + 1; j < lines.length; j += 1) {
      const level = (/^#+/.exec(lines[j]) ?? [''])[0].length;
      if (level > 0 && level <= head.level) {
        end = j;
        break;
      }
    }
    return { ...head, end, lines: lines.slice(head.index + 1, end) };
  });
}

/** The entries of a section: a `- ` line and the continuation lines indented under it. */
function entries(lines) {
  const out = [];
  let current = null;
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (current) out.push(current);
      current = line;
      continue;
    }
    if (current !== null) current += `\n${line}`;
  }
  if (current) out.push(current);
  return out;
}

/**
 * The files one document is spread over.
 *
 * `docs/progress.md` became an index and four volumes (finding 197), and the `###
 * Open` lists went with the rounds they belong to. Reading the index alone would
 * find **no** list and one list respectively -- the first is a red gate, the second
 * is the dangerous one: a scope that shrank while the verdict stayed green, which is
 * the same defect the audit split produced in `blocker-claims.test.ts` and the same
 * one `check-doc-counts` was fixed for an hour earlier.
 */
function filesOf(doc, first) {
  // `--doc` names one file and is not expanded: the tests drive this guard over
  // fixtures, and a fixture is one document. Expanding it to a corpus would make
  // every fixture test read the repository's own log instead of its subject.
  //
  // Only the first document is handed the fixture, and the rest are handed nothing. A
  // fixture is the whole corpus for the run -- `sections()` reads every spelling it knows in
  // whatever file it is given, so one fixture can carry `## Open` and `## Closed` together --
  // and handing the same file to a second document would count its sections twice, which is a
  // number three tests below read.
  if (process.argv.includes('--doc')) return first ? [source(doc.path)] : [];
  if (doc.path !== 'docs/progress.md') return [source(doc.path)];
  return progressCorpus().map((file) => ({ path: file.path, label: file.label }));
}

/**
 * The live list's currency, checked against the corpus that says which rounds happened.
 *
 * Two arithmetic facts and one structural one: the stamp exists, it is one, its number is
 * the count of the entries below it, and its round is the newest round the corpus names.
 * The last one is what turns "somebody should reread the list" into a red build.
 *
 * A corpus with no round heading -- every fixture, and any document that is not this log --
 * has nothing to compare against, and this prints that it had nothing rather than passing
 * quietly over a list it did not check.
 */
function stampChecks({ live, rounds, problems }) {
  if (live.length === 0) return;
  const newest = rounds.reduce(
    (best, one) => (best === null || one.major > best.major || (one.major === best.major && one.minor > best.minor) ? one : best),
    null,
  );
  for (const section of live) {
    const stamps = [...section.text.matchAll(STAMP)];
    if (stamps.length === 0) {
      if (newest === null) {
        console.log('check-open-list: the live list carries no currency stamp, and this corpus names no round to check it against');
        continue;
      }
      problems.push(
        `${section.label}: the live list carries no currency stamp, so nothing in it says a round read it -- ` +
          `it needs \`Checked at ${newest.round}: **N** entries open\`, with N counted from the entries below it`,
      );
      continue;
    }
    if (stamps.length > 1) {
      problems.push(
        `${section.label}: the live list carries ${stamps.length} currency stamps, so "when was this list read" ` +
          'has more than one answer and a reader cannot tell which is current',
      );
      continue;
    }
    const [, round, count] = stamps[0];
    const stated = Number(count);
    console.log(
      `check-open-list: the live list was read at ${round} and holds ${section.open} open entr(ies)${
        newest === null ? '' : `, and the newest round this corpus names is ${newest.round}`
      }`,
    );
    if (stated !== section.open) {
      problems.push(
        `${section.label}: the live list says ${stated} entr(ies) open and the section holds ${section.open}, ` +
          'so the number was not counted from the entries it stands for',
      );
    }
    if (newest !== null && round !== newest.round) {
      problems.push(
        `${section.label}: the live list was last read at ${round} and this corpus names a round at ${newest.round}, ` +
          'so that round wrote itself up without reading the list -- the shape finding 457 was raised for',
      );
    }
  }
}

function check() {
  const problems = [];
  // Every entry the list holds, in either file, so a record's row can be compared with the
  // thing it is a row about.
  //
  // Read up front rather than accumulated as the documents are walked. The row arm asks whether
  // a round's record names a residual "the list holds", and from v3.111 the list is two files --
  // `## Open` in the index and `## Closed` in the record -- so a row that names a residual the
  // round **closed** has to resolve against the record as well. Accumulating it during the walk
  // would make that depend on which document was read first, and a verdict a reordering can flip
  // is not a verdict. A fixture carries both sections in one file, so it supplies its own.
  const listed = [];
  // The corpus's records and rounds, hoisted for the arm after the walk: it asks which record the
  // **newest round** wrote, and that question is about the corpus rather than about the document
  // being read when the answer becomes available.
  const records = [];
  const rounds = [];
  // The ids of the two lists, in one map, because they are one space (finding 570). Pooled here
  // for the same reason `listed` is: the live list is in the index and the record is in a file, and
  // a duplicate id is a fact about both of them.
  const ids = new Map();
  let idEntries = 0;
  let idProblems = 0;
  let idLabel = '';
  let tables = 0;
  let tableRows = 0;
  for (const [position, doc] of DOCS.entries()) {
    const files = filesOf(doc, position === 0);
    if (files.length === 0) continue;
    // Document-wide, not per section: the second list is usually written by copying
    // the first one's shape, so a sentence shared between them is the cheapest thing
    // to leave behind, and a per-section map would not see it. Document-wide now
    // means corpus-wide, because one round's list and another round's list are the
    // same list read at two times.
    const reasons = new Map();
    const live = [];
    let total = 0;
    let closed = 0;
    let sectionsSeen = 0;
    let headings = 0;
    let labelled = files[0].label;
    for (const from of files) {
    let text;
    try {
      text = readFileSync(from.path, 'utf8');
    } catch (error) {
      problems.push(`cannot read ${from.label}: ${error.message}`);
      continue;
    }
    // A heading that begins with one of the two names and is neither of the two spellings this
    // guard reads. Finding 463: the record's heading gained a suffix at v3.45 and nineteen
    // records left the guard's reach without a word, because the match was an exact string.
    // An unknown spelling is refused rather than ignored, so a third one cannot appear quietly.
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (NEARLY.test(trimmed) && spellingOf(trimmed) === null) {
        problems.push(
          `${from.label}: the \`${trimmed}\` heading begins with one of the list names this guard ` +
            'reads and is none of them, so a list written under it would have no reader',
        );
      }
    }
    const found = sections(text, doc.headings);
    // The rounds this corpus says happened. Read from every file, because a volume is
    // where a round is written and the index is where the list is: the stamp has to be
    // comparable with the newest of them, and `--doc` makes that one file.
    //
    // The line number is kept as well, because a record belongs to the round **above** it and
    // "which round wrote this table" is a question about position rather than about text.
    const roundAt = [];
    text.split('\n').forEach((line, index) => {
      const match = ROUND.exec(line);
      if (match === null) return;
      const one = { line: index, round: match[1], major: Number(match[2]), minor: Number(match[3]) };
      rounds.push(one);
      roundAt.push(one);
    });
    if (found.length === 0) continue;
    headings += 1;
    sectionsSeen += found.length;
    labelled = from.label;
    // A list inside a list. The two spellings make this reachable in a way one did not,
    // and it is refused rather than counted twice: an entry counted in both a `## Open`
    // and the `### Left open` it sits inside would make `N open with a reason` a number that
    // depends on how the document is headed rather than on how much is open.
    for (const outer of found) {
      for (const inner of found) {
        if (inner === outer || inner.index <= outer.index || inner.index >= outer.end) continue;
        problems.push(
          `${from.label}: the \`${inner.heading}\` at line ${String(inner.index + 1)} sits inside the ` +
            `\`${outer.heading}\` at line ${String(outer.index + 1)}, so its entries are counted twice and ` +
            'a reader cannot tell which list an entry belongs to',
        );
      }
    }
    found.forEach((section, index) => {
      // Which list this is, and which spelling of it. The index's `## Open` is the live one; a
      // volume's `### Left open` is a record of one round; `### Left open, <suffix>` is a record
      // written as a table, which has rows rather than entries (finding 463).
      const spelling = spellingOf(section.heading) ?? { kind: 'record', form: 'entries' };
      const kind = spelling.kind;
      const items = entries(section.lines);
      if (spelling.form === 'table') {
        const shape = tableShape(section.lines);
        if (shape.problem !== null) {
          problems.push(`${from.label}: the \`${section.heading}\` record ${shape.problem}`);
          return;
        }
        if (items.length > 0) {
          problems.push(
            `${from.label}: the \`${section.heading}\` record is written in table form and carries ` +
              `${items.length} entr(ies), so an entry sits under a heading this guard reads as rows`,
          );
        }
        tables += 1;
        tableRows += shape.rows;
        // Which round wrote this record: the nearest round heading above it. A record with no
        // round above it is a fixture, or a document from before rounds had headings, and it is
        // read for its shape and not for the company its rows keep.
        const owner = roundAt.filter((one) => one.line < section.index).at(-1) ?? null;
        if (owner !== null) {
          records.push({
            label: from.label,
            owner,
            items: (shape.rowLines ?? []).map((row) => cellsOf(row)[COLUMNS.indexOf('item')] ?? ''),
          });
        }
        return;
      }
      if (items.length === 0) {
        problems.push(
          `${from.label}: the \`${section.heading}\` section ${index + 1} of ${found.length} is empty, ` +
            'so this guard has no subject',
        );
        return;
      }
      total += items.length;
      // A record written as bullets is a record too.
      //
      // From v3.70 the rounds write `### Left open` with entries instead of a table, and the row
      // arm below collected only the table form -- so "the newest record" was the newest *table*,
      // and that was **v3.69 for forty-one rounds**: an arm whose stated subject is the record
      // that can still be edited, reading one that had been frozen since v3.69. It stayed green
      // because the rows happened to quote entries the list still carried, and it went red the
      // moment those entries moved out of the list (finding 568).
      //
      // The item of a bullet record is its headline, which is the sentence the round wrote; the
      // body is where the reading is, and a row is a claim about a subject rather than a copy of
      // the paragraph.
      if (kind === 'record') {
        const owner = roundAt.filter((one) => one.line < section.index).at(-1) ?? null;
        if (owner !== null) {
          records.push({
            label: from.label,
            owner,
            items: items.map((item) => item.split('\n')[0].slice(2).trim()),
          });
        }
      }
      let openHere = 0;
      for (const item of items) {
        const headline = item.split('\n')[0];
        const first = headline.slice(2).trim();
        listed.push(item);
        // The entry's identity, read before either refusal, so that an entry refused for being
        // struck where it stands still contributes its id to the space: a document with two
        // defects should say both, and a set that silently lost the id of the entry it was
        // already refusing would report the second defect as a gap (finding 570).
        //
        // The requirement is these two lists and not the records, and that scope is a statement
        // about what an id is for: a record is frozen, it moves nothing, and its entries are how
        // a round reported itself. A rule that wanted ids of them would demand a repair of every
        // round ever written.
        if (kind === 'live' || kind === 'closed') {
          idEntries += 1;
          const id = idOf(headline);
          if (id === null) {
            idProblems += 1;
            problems.push(
              `${from.label}: an entry carries no id, so a move cannot be told from a deletion -- put ` +
                '`O-NNN · ` right after the bullet, at one more than the highest number the two lists ' +
                `hold: ${first.slice(0, 80)}`,
            );
          } else if (id.digits.length > 3) {
            // The grep the width protects, named as the token that would swallow this one.
            idProblems += 1;
            problems.push(
              `${from.label}: the id ${id.token} is ${String(id.digits.length)} digits wide and the token ` +
                `is three, so a prefix grep for ${idToken(Number(id.digits.slice(0, 3)))} would find it: ` +
                `${first.slice(0, 80)}`,
            );
          } else if (id.digits.length < 3) {
            // The other direction, and it is not the same defect: a narrow id is a *second spelling* of a
            // number, so the space would report a hole at the padded token while the entry that fills it
            // stands here. A message that said "a prefix grep would find it" of this id would be false --
            // `grep O-009` does not match `O-9` -- and would send a reader to look for a collision that
            // does not exist.
            idProblems += 1;
            problems.push(
              `${from.label}: the id ${id.token} is ${String(id.digits.length)} digit(s) wide and the token ` +
                `is three, so it is not ${idToken(Number(id.digits))} and the space would report a hole where ` +
                `this entry stands: ${first.slice(0, 80)}`,
            );
          } else if (Number(id.digits) === 0) {
            // The space starts at 1, and `O-000` is the one token that passes the width rule and is still
            // not a number in it. It matters beyond tidiness: the summary line promises "N entries with ids
            // 1..N", and a set holding zero and one would print `1..2` over two ids that are `O-000` and
            // `O-001` -- a sentence about a space the file does not hold, printed by the arm whose whole
            // subject is that a published number must be the count of the thing it stands for.
            idProblems += 1;
            problems.push(
              `${from.label}: the id ${id.token} is zero and the space starts at ${idToken(1)}, so the entry ` +
                `has no number in the space the two lists share: ${first.slice(0, 80)}`,
            );
          } else if (ids.has(id.token)) {
            idProblems += 1;
            problems.push(
              `${from.label}: the id ${id.token} names two entries -- one here and one at ` +
                `${String(ids.get(id.token))} -- so a reused id hides a closure: ${first.slice(0, 80)}`,
            );
          } else {
            ids.set(id.token, `${from.label}: ${first.slice(0, 60)}`);
            if (idLabel === '') idLabel = from.label;
          }
        }
        // The split, enforced. Two refusals, one per side, and they are the whole reason the
        // record is a separate file rather than a section that happens to be long today.
        //
        // A struck entry in the live list is history filed as work: a reader who greps the
        // list for what is not done finds it, and the index pays for it in bytes forever. That
        // is how `## Open` reached 98,927 bytes -- and the index that holds it cannot exceed
        // the volume it is compared with, so the cost was not aesthetic.
        //
        // An unstruck entry in the record is the mirror, and it is worse: it is work that
        // nobody will do, because the only list a reader consults for work is the live one.
        if (kind === 'live' && CLOSED.test(headline)) {
          problems.push(
            `${from.label}: the live list holds a struck entry, so history is filed as work: ` +
              `move it to \`docs/progress/closed.md\` and delete it here -- ${first.slice(0, 80)}`,
          );
          continue;
        }
        if (kind === 'closed' && !CLOSED.test(headline)) {
          problems.push(
            `${from.label}: \`## Closed\` holds an entry that is not struck, so work is filed as history ` +
              `and no reader of the live list will see it -- ${first.slice(0, 80)}`,
          );
          continue;
        }
        // The entry's own reason, read once: the closed branch needs it to refuse a bullet
        // that is history in its headline and work in its body, and the open branch needs it
        // to refuse the mirror. Reading it in two places would let the two drift.
        const marker = reasonOf(item);
        if (CLOSED.test(headline)) {
          if (marker !== null && !struckReason(item, marker)) {
            problems.push(
              `${from.label}: a closed entry still carries an unstruck open reason, so it reads as ` +
                `history in its headline and as work in its body: ${first.slice(0, 80)}`,
            );
            continue;
          }
          if (CITED.test(item) || UNCITED.test(item)) {
            closed += 1;
            continue;
          }
          problems.push(
            `${from.label}: a closed entry is struck through and does not say what closed it, so a ` +
              `reader cannot check the closure: ${first.slice(0, 80)}`,
          );
          continue;
        }
        if (!marker) {
          problems.push(
            `${from.label}: an entry says neither that it is closed nor why it is open, so a reader ` +
              `cannot tell work from history: ${first.slice(0, 80)}`,
          );
          continue;
        }
        // The mirror of the branch above, and the defect finding 461 was raised for: the
        // headline is the claim, but a bullet whose own reason is struck says "closed" in the
        // sentence a reader reads last, and this guard used to read that reason for its length
        // and for nothing else. Two entries in the shipped list ended in `~~[open: ...]~~ Closed
        // by finding N` and were counted as work.
        if (struckReason(item, marker)) {
          problems.push(
            `${from.label}: the entry's own reason is struck through and its headline is not, so this ` +
              `bullet says it is open and closed at once -- strike the headline if the entry is history, ` +
              `and leave the reason alone if it is not: ${first.slice(0, 80)}`,
          );
          continue;
        }
        openHere += 1;
        const open = marker;
        const reason = open[1].trim();
        if (reason.length < 40) {
          problems.push(
            `${from.label}: the open reason is ${reason.length} character(s); "still open" is not a ` +
              `reason: ${first.slice(0, 60)}`,
          );
        }
        // Scoped to one kind, and that scope is the whole point.
        //
        // Two **records** sharing a sentence is a copy-paste: the second round re-signed the
        // first one's text without reading it, and the same reason was made to carry two
        // different residuals. A live entry and a record sharing one is not that -- it is a
        // residual that a round raised and the live list still carries, which is how a
        // carried-forward item is supposed to look. Refusing it would make the live list
        // unable to name anything a round had already named.
        const key = `${kind}:${reason}`;
        if (reasons.has(key)) {
          problems.push(
            `${from.label}: two entries share an open reason (${reason.slice(0, 40)}), so one of them is ` +
              'a placeholder that will be re-signed without being read',
          );
        }
        reasons.set(key, first);
      }
      if (kind === 'live') live.push({ label: from.label, text: section.lines.join('\n'), open: openHere });
    });
    }
    if (headings === 0) {
      problems.push(
        `${files[0].label} has none of ${doc.headings.map((one) => `\`${one}\``).join(' or ')}, in the ` +
          'index or in any volume; the list this guard reads is gone',
      );
      continue;
    }
    console.log(
      `check-open-list: OK (${total} entry(ies) across ${sectionsSeen} section(s) of ${
        files.length > 1 ? 'docs/progress.md and its volumes' : labelled
      }: ${total - closed} open with a reason, ${closed} closed by a finding)`,
    );
    stampChecks({ live, rounds, problems });
  }

  // The id space, checked once the walk has read both files.
  //
  // ## Why it is here rather than inside the walk
  //
  // The space is a fact about the two lists together, and the two lists are two files. A check that
  // ran per document would compare the ids of the live list with the ids of the live list, and call
  // the space dense at forty while the record held the other thirty-nine -- which is finding 568's
  // lesson (an arm whose population was what it had read rather than what the list holds) applied to
  // a set instead of to a row.
  //
  // ## Why a gap is a defect and not a gap
  //
  // An entry has exactly one way out of these lists: it is closed, and a closure carries its id into
  // the record. So every number is spent once and stays spent, and the numbers that are present are
  // 1..N with nothing missing. A hole is therefore the one thing a reader of the live list cannot see
  // -- a residual that was deleted rather than closed -- and it is the shape v3.111's tiling equation
  // was measured for and could not guard.
  //
  // The check is skipped when an id was missing or repeated, and that is deliberate: the space is
  // only dense if it is complete, so a document already refused for an unreadable id would also be
  // reported as having a hole in it, and the second message would be about the first message's
  // subject. One defect, one diagnostic.
  if (idEntries > 0 && idProblems === 0) {
    const numbers = [...ids.keys()].map((token) => Number(token.slice(2))).sort((a, b) => a - b);
    const top = numbers[numbers.length - 1] ?? 0;
    const missing = [];
    for (let n = 1; n <= top; n += 1) if (!ids.has(idToken(n))) missing.push(idToken(n));
    if (missing.length > 0) {
      problems.push(
        `${idLabel}: the two lists hold ${String(idEntries)} entr(ies) and their ids run to ` +
          `${String(top)}, so the ids skip ${missing.slice(0, 4).join(', ')}${
            missing.length > 4 ? ` and ${String(missing.length - 4)} more` : ''
          } -- an entry leaves these lists only by being closed, and a closure carries its id with it`,
      );
    } else {
      console.log(
        `check-open-list: ${String(idEntries)} entr(ies) with ids 1..${String(idEntries)}, and none is missing`,
      );
    }
  }

  // The newest round's record, matched against the list.
  //
  // ## What this arm is for
  //
  // A record's `item` column is a place a residual can live with **no entry behind it**, and
  // four of them did: the only P1 in this log -- the remote's history sharing no name with the
  // local one -- spent six rounds in records and never appeared in the list that calls itself
  // the only live list. A reader who greps for what is open, which is the reader the live list
  // exists for, was not told about the largest thing outstanding.
  //
  // The count could not see it. The stamp is arithmetic over the entries below it, so a
  // residual that is not an entry is not a residual as far as the stamp is concerned -- and
  // the guard printed both numbers (eleven open, seven rows judged in the newest record)
  // without ever asking whether they were talking about the same set.
  //
  // ## Why only the newest round's record
  //
  // Older records are frozen: nothing appends to them, and a round that has been written up
  // cannot be repaired. Their rows are history and their paraphrases are how the log was kept.
  // The newest record is the one that can still be edited, so it is the one this arm reads --
  // the same scope, and for the same reason, as the currency stamp's round comparison.
  //
  // ## Why it runs after the walk, and what that fixed
  //
  // Two defects, both found by v3.111's split (finding 568).
  //
  // The first is the selection. It used to be `records.reduce(newest)` over the **table** form
  // only, and the rounds stopped writing tables at v3.70 -- so "the newest record" was v3.69,
  // and this arm spent forty-one rounds judging a record that had been frozen since. It stayed
  // green because those rows happened to quote entries the list still carried. The selection is
  // by **owner** now, and both forms are collected: a record written as a list of entries is a
  // record, and its item is the sentence the round wrote.
  //
  // The second is the population. The arm compares a row against "the list", and from v3.111
  // the list is two files: `## Open` in the index and `## Closed` in the record. A row may name
  // a residual the round *closed* -- that is what closing it meant -- and while closures were
  // struck in place, the row resolved against the live list. Moving them narrowed the population
  // to what is still open and the arm went red on rows that had been right for forty rounds. The
  // population is every entry the list holds, in either file, and it is complete here because
  // the walk has read both.
  //
  // Running after the walk is what makes the second fix order-independent: accumulating the
  // population during the walk would have made the verdict depend on which document was read
  // first, and a verdict a reordering can flip is not a verdict.
  const newestRound = rounds.reduce(
    (best, one) =>
      best === null ||
      one.major > best.major ||
      (one.major === best.major && one.minor > best.minor)
        ? one
        : best,
    null,
  );
  const newestRecord =
    newestRound === null ? null : (records.find((one) => one.owner.round === newestRound.round) ?? null);
  let quotedRows = 0;
  if (newestRecord !== null) {
    const population = listed.map((one) => plain(one));
    for (const item of newestRecord.items) {
      const row = plain(item);
      if (row.length < 20) {
        problems.push(
          `${newestRecord.label}: the ${newestRecord.owner.round} record has a row whose item is ` +
            `${row.length} character(s), too short to name an entry: ${item.slice(0, 60)}`,
        );
        continue;
      }
      if (population.some((one) => one.includes(row))) {
        quotedRows += 1;
        continue;
      }
      problems.push(
        `${newestRecord.label}: the ${newestRecord.owner.round} record names a residual the list does ` +
          `not hold -- "${item.slice(0, 60)}" appears in no entry of \`## Open\` or \`## Closed\` -- so it is a ` +
          'residual a reader of the list is not told about; add the entry, or quote the entry the row is about',
      );
    }
  }
  console.log(
    `check-open-list: ${String(tables)} record(s) in table form (${String(tableRows)} row(s)); ` +
      (newestRecord === null
        ? 'the newest round wrote none, so no row was judged'
        : `the ${newestRecord.owner.round} record's ${String(quotedRows)} row(s) were judged, and every one ` +
          'of them quotes an entry'),
  );

  if (problems.length > 0) {
    // The problems first, the verdict last, so the diagnostic a `gate-sites.json`
    // entry quotes is the verdict line rather than the last bullet -- the same order
    // every other gate in this repository prints in.
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('check-open-list: FAILED');
    return 1;
  }
  return 0;
}

// A literal `process.exit(1)` rather than `process.exit(check())`, because
// `derive-gate-sites.mjs` attributes a *failure site* to a literal exit next to its
// diagnostic, and a computed exit it can only record as excluded -- which is how
// finding 150's gate ended up with no site at all. The diagnostic string above is
// what the entry table reads.
if (check() !== 0) {
  process.exit(1);
}

