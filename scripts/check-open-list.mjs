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

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { progressCorpus } from './docs-corpus.mjs';
import { dirname, join, resolve } from 'node:path';
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
  // The record is the one entry here whose `path` is a **stem** rather than a file: v3.113 made it
  // a set (`closed.md`, then `closed-NN.md` from `02` up) because a single path is a population
  // nobody completes, and `recordSet()` discovers it rather than trusting this line. The path below
  // is still what `recordSet()` starts from and what the diagnostics name when a fixture run does
  // not read a record at all.
  //
  // The row arm below runs **after** this walk rather than inside it, and that is what makes the
  // list it compares against whole: a row may name a residual the round closed, and the closure
  // is in the record, which is one file or more. An arm that ran per document would see only the
  // entries of the documents read so far, and its verdict would depend on their order.
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

/** The record's first file, and the directory its files live in. */
const RECORD_PATH = 'docs/progress/closed.md';
const RECORD_DIR = 'docs/progress';
/** Every name that is a second or later file of the record: `closed-02.md` and up. */
const CONTINUATION = /^closed-(\d{2})\.md$/;
/** What a file has to be called to be *named like* the record, whether it is one or not. */
const RECORD_STEM = 'closed';

/**
 * The budget for the **last** file of the record.
 *
 * The same number as a volume's, and for the same reason rather than by coincidence: both
 * are documents a round reads, and one number for "how big a document this log reads" is one
 * number a reader has to hold. The asymmetry is the volume rule's too -- only the last file is
 * judged, because the files above it are frozen records and a budget applied to a record is a
 * budget applied to something nobody may edit.
 *
 * `RCA_RECORD_BUDGET` exists for the fixture that has to cross the line without writing two
 * hundred kilobytes into a temp directory, the same way `RCA_PROGRESS_DIR` exists for the
 * volume rules. A value that is not a positive number is refused rather than ignored: a
 * budget that quietly became `NaN` would be a rule that never fires, which is the shape of
 * every defect this file's neighbours were written to make visible.
 */
const RECORD_BUDGET = Number(process.env['RCA_RECORD_BUDGET'] ?? 200_000);

/**
 * The record's files: `closed.md`, then `closed-NN.md` from `02` up, contiguous.
 *
 * ## Why this is discovered rather than named
 *
 * Until v3.113 the record was one path in `DOCS`, and a second file with the same heading was
 * simply not read -- so ten entries could leave the corpus (moved into `closed-02.md`) and every
 * verdict stayed green, including the one finding 570 added for exactly this: the summary line
 * printed `69 entr(ies) with ids 1..69, and none is missing` while ten were missing. The id space
 * is dense *within the population it is given*, so no property of the ids can notice a file that
 * was never opened. The population has to be complete before the identity rule means anything.
 *
 * ## What the names are checked against
 *
 * Three refusals, and they are the three ways a set loses a member:
 *
 *   - a **gap** in the numbering -- a deleted file is its entries, and the file after it begins
 *     a numbering whose predecessor does not exist;
 *   - a name that is **named like the record and is not one of its files** -- `closed-copy.md`
 *     reads as a closure log to a person and as nothing to this guard, which is finding 463's
 *     shape (an unknown spelling refused rather than ignored) applied to file names;
 *   - a **second first file** -- `closed-01.md` beside `closed.md` is two answers to "where does
 *     the record begin", and the first file is the one the index links to.
 *
 * ## The budget, judged on the last file only
 *
 * The record grows by closures, so the file a round appends to is the last one. A last file over
 * the budget is refused with the name of the next one to open, because the alternative is that the
 * round which crosses the line decides the naming -- at the moment it is least free to think about
 * it. The files above are frozen and are not judged.
 */
function recordSet() {
  const dir = process.env['RCA_RECORD_DIR'];
  // `--doc` says "the whole corpus is this one file", and every fixture that carries `## Open` and
  // `## Closed` in one document says it. A **set** is not a file, so a fixture that wants a set
  // hands the guard a directory instead: the two switches name two subjects, and the ids they
  // carry are one space because the space is a fact about both lists.
  if (process.argv.includes('--doc') && dir === undefined) return { files: [], problems: [] };
  const root = dir ?? resolve(ROOT, RECORD_DIR);
  const label = (name) => (dir === undefined ? `${RECORD_DIR}/${name}` : join(root, name));

  const problems = [];
  if (!Number.isFinite(RECORD_BUDGET) || RECORD_BUDGET <= 0) {
    problems.push(
      `RCA_RECORD_BUDGET is ${String(process.env['RCA_RECORD_BUDGET'])}, and a budget has to be a ` +
        'positive number of bytes -- a limit that cannot be compared is a rule that never fires',
    );
    return { files: [], problems };
  }

  let names;
  try {
    names = readdirSync(root);
  } catch {
    // A directory that cannot be read is one unreadable file as far as the walk is concerned: it
    // reports `cannot read` with the path it tried, which is the diagnostic a reader can act on.
    return { files: [{ label: label('closed.md'), path: resolve(root, 'closed.md') }], problems };
  }

  const known = [];
  for (const name of [...names].sort()) {
    if (!name.startsWith(RECORD_STEM)) continue;
    if (name === 'closed.md') {
      known.push({ name, number: 1 });
      continue;
    }
    const continuation = CONTINUATION.exec(name);
    if (continuation === null) {
      problems.push(
        `${label(name)}: this file is named like the record and is not one of its files -- the record ` +
          'is `closed.md` and then `closed-NN.md` from `02` up, so the closures in this one are read ' +
          'by nothing; rename it into the numbering, or delete it',
      );
      continue;
    }
    const number = Number(continuation[1]);
    if (number < 2) {
      problems.push(
        `${label(name)}: the record's first file is \`closed.md\`, and ${name} is a second answer to ` +
          '"where does the record begin" -- the index links to the first one, so a reader would ' +
          'reach one of the two',
      );
      continue;
    }
    known.push({ name, number });
  }

  known.sort((a, b) => a.number - b.number);
  const top = known.at(-1)?.number ?? 1;
  for (let n = 1; n <= top; n += 1) {
    if (known.some((one) => one.number === n)) continue;
    const missing = n === 1 ? 'closed.md' : `closed-${String(n).padStart(2, '0')}.md`;
    const after = known.filter((one) => one.number > n).map((one) => `\`${one.name}\``);
    problems.push(
      `${label(missing)}: the record's files skip ${missing}, so the numbering then continues at ` +
        `${after.join(' and ')} with no predecessor -- a file that was deleted is its entries, and ` +
        'no reader is told',
    );
    break;
  }

  const last = known.at(-1);
  if (last !== undefined && problems.length === 0) {
    let bytes = 0;
    try {
      bytes = statSync(resolve(root, last.name)).size;
    } catch {
      bytes = 0;
    }
    if (bytes > RECORD_BUDGET) {
      const next = `closed-${String(last.number + 1).padStart(2, '0')}.md`;
      problems.push(
        `${label(last.name)}: the last file of the record is ${String(bytes)} bytes and the budget is ` +
          `${String(RECORD_BUDGET)}, so the next closure needs a file of its own -- open ` +
          `\`${next}\` beside it and put the closure there; the files above are frozen and are not judged`,
      );
    }
  }

  return {
    files: known.map((one) => ({ label: label(one.name), path: resolve(root, one.name) })),
    problems,
  };
}

/**
 * Where a continuation file of the record has to begin, and the two ways it does not.
 *
 * The volume rule's counterpart. A volume that opens mid-entry is a boundary drawn through a
 * sentence, and the rule there is that each volume begins at a `## ` heading. The record's files
 * are the same shape with one difference: the first file carries the preamble that says what the
 * numbers mean, and a second file may not -- a preamble at the top of `closed-02.md` is a document
 * that was cut through its own introduction, and the entries below it would still be counted, so
 * nothing else in this file would notice.
 *
 * The second way is the one with no diagnostic at all: a file whose heading is missing or spelled
 * differently is a file `sections()` finds nothing in, so the walk goes on to the next one and the
 * corpus is silently smaller. The heading check is here rather than in `recordSet()` because the
 * spelling rule for headings already lives in this walk (`NEARLY`), and a file refused before it
 * was opened could not be told apart from a file that could not be read.
 */
function continuationBoundary(text, from, first) {
  if (from === first) return null;
  const lines = text.split('\n');
  const heading = lines.findIndex((line) => line.trim() === '## Closed');
  if (heading === -1) {
    return (
      `${from.label}: this file of the record carries no \`## Closed\` heading, so its entries sit in ` +
      'no list this guard reads -- every file of the record is one document, and a file without its ' +
      'heading is a set of closures nobody is told about'
    );
  }
  const opening = lines.slice(heading + 1).find((line) => line.trim() !== '');
  if (opening === undefined) return null;
  if (!opening.trimStart().startsWith('- ')) {
    return (
      `${from.label}: this file of the record begins with "${opening.trim().slice(0, 60)}", which is ` +
      'not an entry -- a boundary drawn through an entry cuts a document in half, and the preamble ' +
      'belongs to the first file'
    );
  }
  return null;
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
 * How much of a row has to appear inside an entry for the row to be *about* that entry.
 *
 * Finding 468 published this ruler and measured the corpus with it: strip the marks, normalise the
 * quotes and the dash, collapse the whitespace, drop the case and the trailing full stop, then
 * require twenty characters of the row to appear inside an entry. Twenty is a floor taken from the
 * corpus rather than from principle -- the shortest row that names anything is 25 characters, so a
 * rule that accepted `see above` would be accepting a coincidence. Measured at v3.114, under the same
 * ruler: the **80** entries of the two lists have **80** distinct first twenty characters, so no row
 * that begins with an entry's words can be mistaken for a row about a different entry.
 *
 * What the code did instead, from v3.65 to v3.113, was require the **whole** row (finding 574). That
 * is not a stricter reading of the same rule, it is a different rule: it demands that a round's own
 * prose about a residual be identical to the list's prose about it, in two documents written by one
 * hand at one time -- which is exactly the paraphrase finding 468 argued a record *is*.
 *
 * Forty-eight rounds could not tell the two apart. Until v3.113 the subject was a table, and a
 * table's row is a cell rather than an entry, so no row was ever a copy of the thing it was
 * compared with; from v3.113 the subject is a list of entries, and the row was the very bullet it
 * was compared with (finding 573), so every ruler however strict was satisfied. The first reading
 * that could separate them is the one after the population was narrowed, and it refused the shipped
 * v3.113 record over a row the published ruler accepts.
 */
const ROW_QUOTE = 20;

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
function filesOf(doc) {
  // `--doc` names one file and is not expanded: the tests drive this guard over
  // fixtures, and a fixture is one document. Expanding it to a corpus would make
  // every fixture test read the repository's own log instead of its subject.
  //
  // The record is not asked here at all any more: it is a set `recordSet()` discovers, and a
  // fixture that wants a set hands it `RCA_RECORD_DIR`. What is left in this function is the
  // index and its volumes, which are one document read across eighteen files because a round
  // is where it was written.
  if (process.argv.includes('--doc')) return [source(doc.path)];
  return progressCorpus().map((file) => ({ path: file.path, label: file.label }));
}

/**
 * What the summary calls the document it just read.
 *
 * One file is called by its own label, and that is the case every fixture is in. The index is
 * called by what it is rather than by the first of its eighteen files, because a reader of the
 * gate's output is asking about the log rather than about `volume-01.md`. The record is called by
 * naming its files, because that is the fact the set rule added and the one a reader has to be able
 * to check: which files of this tree are closures, and in what order they are read.
 */
function nameOf(doc, files, labelled) {
  if (files.length === 1) return labelled;
  if (doc.path !== RECORD_PATH) return 'docs/progress.md and its volumes';
  return files.map((one) => one.label).join(' and ');
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
  // What a record's row may resolve against: the two lists, and **not** the records.
  //
  // ## Why a record is not a witness of itself (finding 573)
  //
  // Until v3.114 this held every entry the walk read, records included. That was harmless while the
  // arm's subject was a **table**: a table's rows are cells, and a cell is not an entry. v3.113 fixed
  // the selection so the arm reads the newest record whatever form it was written in, and the form
  // every round has written since v3.70 is a `### Left open` list -- whose items are its **entries**.
  // The arm's rows were then drawn from the same array they were compared with, so
  // `population.some((one) => one.includes(row))` was true by construction and the sentence it
  // printed -- "every one of them quotes an entry" -- was true of a set with one member.
  //
  // The fix is not a bug fix, it is the rule: a row is a claim *about* an entry somewhere else, and a
  // record that witnesses itself verifies nothing whatever it says. It is also what this arm's own
  // diagnostic had promised all along -- "appears in no entry of `## Open` or `## Closed`".
  //
  // ## Why both lists, and why up front
  //
  // A row may name a residual the round **closed**, because that is what closing it meant, and from
  // v3.111 that entry is in the record of closures rather than in `## Open`. Pooling the two up front
  // rather than accumulating as the walk goes is what keeps the verdict independent of which
  // document was read first: a verdict a reordering can flip is not a verdict.
  const witnesses = [];
  // The corpus's records and rounds, hoisted for the arm after the walk: it asks which record the
  // **newest round** wrote, and that question is about the corpus rather than about the document
  // being read when the answer becomes available.
  const records = [];
  const rounds = [];
  // The ids of the two lists, in one map, because they are one space (finding 570). Pooled here
  // for the same reason `witnesses` is: the live list is in the index and the record is in a file, and
  // a duplicate id is a fact about both of them.
  const ids = new Map();
  // The record's ids in the order its files hold them. The map answers "is this number used"; this
  // answers "do the files hold the numbers in order", which is a question a single file cannot get
  // wrong and a set of files can.
  const ordered = [];
  let idEntries = 0;
  let idProblems = 0;
  let idLabel = '';
  let tables = 0;
  let tableRows = 0;
  // The record's files, discovered before the walk and their problems reported first: a file that
  // was never opened is a fact about the corpus, and every verdict below is computed from the
  // corpus it was given. Reporting it after the walk would put the largest defect last.
  const record = recordSet();
  for (const problem of record.problems) problems.push(problem);
  // Where a closure belongs, which is the **last** file of the record: the only one a round may
  // still edit. Read from the discovered set rather than accumulated during the walk -- the index is
  // read first, so a value assembled in the loop is the *fallback* at the moment the live list's
  // refusal needs it, and the refusal would name the first file of a two-file record. The shipped
  // path is what a fixture run gets, and it is the right advice there as well: the fixture is not
  // where closures go, the record is.
  let recordTarget = record.files.at(-1)?.label ?? RECORD_PATH;
  for (const doc of DOCS) {
    const files = doc.path === RECORD_PATH ? record.files : filesOf(doc);
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
    // A continuation file of the record is a boundary, and a boundary has two ways to be wrong:
    // drawn in the wrong place (before an entry, so the first entry starts mid-sentence) or not
    // drawn at all (no heading, so the entries sit in no list this guard reads). Both are refused
    // here rather than counted: a file the walk silently skips reports as a smaller corpus, which
    // is the defect this whole round is about.
    //
    // The record only. The index's volumes are a document read across eighteen files too, and a
    // volume is *forbidden* the record's heading rather than required to have it -- a `## Closed`
    // in a volume would be a closure list nobody read before this round made the record a set.
    const boundary = doc.path === RECORD_PATH ? continuationBoundary(text, from, files[0]) : null;
    if (boundary !== null) {
      problems.push(boundary);
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
        // A record is found by the round heading above it, and a record with no heading above it is
        // found by nothing: it never reaches `records`, so the arm that judges rows never sees it,
        // and the entries it holds are still counted -- the summary would report a larger corpus with
        // one record unjudged (finding 577). The two are indistinguishable from a legacy record
        // unless the file is asked, and the file answers: volumes 01 to 03 name their rounds `## Pass
        // N`, so they carry no `## vX.Y` heading at all, while every volume written since starts with
        // one on its first line. So the rule is scoped to a file that names rounds -- in such a file,
        // a record above the first heading was written too high rather than too early.
        if (owner === null && roundAt.length > 0) {
          problems.push(
            `${from.label}: the \`${section.heading}\` at line ${String(section.index + 1)} sits above this ` +
              "file's first round heading, so the round it belongs to cannot be named -- a record is found " +
              'by the round above it, and this one is judged by nothing; move it under its round',
          );
        }
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
        // The witness list, and the exclusion is the arm's subject rather than an economy: a
        // record's bullets **are** the rows, so a record that is also a witness is a row that
        // resolves against itself (finding 573). Only these two lists hold residuals a reader can
        // grep for -- `## Open` for what is still work, `## Closed` for what was closed and by what.
        if (kind === 'live' || kind === 'closed') witnesses.push(item);
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
            // The record only, and the scope is the whole of what the order means. The live list and
            // the record are two populations: `O-002` can be closed while `O-003` is open, so the
            // corpus in read order is not a run of numbers and a rule over it would refuse a document
            // that is right. Within the record the numbers **are** a run -- a closure keeps its
            // number and slots in at its place, which is why the shipped record ascends and why its
            // files hold consecutive ranges -- and the file boundary has to fall on that run rather
            // than across it.
            if (kind === 'closed') {
              ordered.push({ number: Number(id.digits), token: id.token, label: from.label });
            }
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
              `move it to \`${recordTarget}\` and delete it here -- ${first.slice(0, 80)}`,
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
      `check-open-list: OK (${total} entry(ies) across ${sectionsSeen} section(s) of ${nameOf(
        doc,
        files,
        labelled,
      )}: ${total - closed} open with a reason, ${closed} closed by a finding)`,
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
    // The sequence, which is the property a set of files has and a single file does not. A boundary
    // can be placed anywhere, and one placed in front of the older half leaves the space dense while
    // reversing the record's own order -- density cannot see that, because the set is the same set.
    // What the record guarantees is that its files hold the numbers in order: `closed.md` holds the
    // lower range and `closed-02.md` the higher one, and a file boundary that falls anywhere else is
    // a record filed in the wrong place.
    let previous = null;
    for (const one of ordered) {
      if (previous !== null && one.number < previous.number) {
        problems.push(
          `${one.label}: the id ${one.token} comes after ${previous.token}, and the record's files ` +
            'are read in name order -- a record whose numbers run backwards is a file, or an entry, ' +
            'filed in the wrong place, and every citation into it means the order',
        );
        break;
      }
      previous = one;
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
  //
  // ## The subject became right and the evidence became the subject (finding 573)
  //
  // The selection fix is what made this arm read a record whose rows **are entries**. Before it the
  // subject was a table frozen since v3.69 -- a record that could not change, judged against a list
  // that could -- so the green was a coincidence. After it the subject is the round's own
  // `### Left open`, and those bullets were already in the population: `records.push` took the
  // headlines of the very entries `witnesses.push` had taken, so every row resolved against itself.
  // v3.113's own reading was two rows, both reported as quoting an entry, and one of them quoted
  // nothing but itself.
  //
  // The repair is the exclusion at the push site, and it states the arm's subject rather than
  // tightening it: a row is a claim about an entry **somewhere else**.
  //
  // ## The ruler the arm published was not the ruler it used (finding 574)
  //
  // With the population narrowed, the shipped v3.113 record went red -- on a row that is right. Its
  // first twenty characters are the live entry's, and its tail is the round's own account, which is
  // the paraphrase finding 468 measured the corpus for and published a ruler about. The code had
  // been requiring the **whole** row, and no test could tell, because a self-witnessing row
  // satisfies any ruler however strict it is. `ROW_QUOTE` is the published ruler, implemented.
  //
  // ## One round, one record (finding 575)
  //
  // The selection is "the first record whose owner is the newest round", so a round that wrote two
  // records would have one judged and the other passed in silence -- an arm whose subject is *the*
  // newest record, with two candidates. Nothing shipped does this (zero of 195 rounds, measured at
  // v3.114), and the refusal is scoped to the newest round for the reason every rule here is scoped
  // that way: only that round can still merge its two halves.
  const newestRound = rounds.reduce(
    (best, one) =>
      best === null ||
      one.major > best.major ||
      (one.major === best.major && one.minor > best.minor)
        ? one
        : best,
    null,
  );
  // A round writes **one** record, and two under one heading is two answers to "what did this round
  // leave open" -- with this arm judging whichever `find` reached first and passing the other in
  // silence (finding 575). The shape is finding 162's (`a document that gains a list must gain a
  // reader for it`), one kind over: the second list here has no reader at all, because the arm's
  // subject is a round's record and a round has one.
  //
  // The scope is the newest round, which is the only one whose record can still be merged; a frozen
  // round's second section would be a demand for a repair the corpus forbids. That costs nothing
  // today -- measured at v3.114, no shipped record belongs to a round that wrote two -- so this is a
  // floor that closes the silence before it has a tenant.
  const sameRound =
    newestRound === null ? [] : records.filter((one) => one.owner.round === newestRound.round);
  if (sameRound.length > 1) {
    problems.push(
      `${sameRound[1].label}: the ${newestRound.round} round wrote ${String(sameRound.length)} records, so ` +
        `"what that round left open" has ${String(sameRound.length)} answers and only the first of them is ` +
        'judged -- merge them under one heading, because a round has one record',
    );
  }
  const newestRecord = sameRound[0] ?? null;
  let quotedRows = 0;
  if (newestRecord !== null) {
    const population = witnesses.map((one) => plain(one));
    for (const item of newestRecord.items) {
      const row = plain(item);
      if (row.length < ROW_QUOTE) {
        problems.push(
          `${newestRecord.label}: the ${newestRecord.owner.round} record has a row whose item is ` +
            `${row.length} character(s), too short to name an entry: ${item.slice(0, 60)}`,
        );
        continue;
      }
      if (population.some((one) => one.includes(row.slice(0, ROW_QUOTE)))) {
        quotedRows += 1;
        continue;
      }
      problems.push(
        `${newestRecord.label}: the ${newestRecord.owner.round} record names a residual the list does ` +
          `not hold -- "${item.slice(0, 60)}" appears in no entry of \`## Open\` or \`## Closed\` -- so it is a ` +
          `residual a reader of the list is not told about; the row's first ${String(ROW_QUOTE)} characters ` +
          'have to appear in an entry, so add the entry or open the row with its words',
      );
    }
  }
  console.log(
    `check-open-list: ${String(tables)} record(s) in table form (${String(tableRows)} row(s)); ` +
      (newestRecord === null
        ? 'the newest round wrote none, so no row was judged'
        : `the ${newestRecord.owner.round} record's ${String(quotedRows)} row(s) were judged, and every one ` +
          `of them matches an entry on its first ${String(ROW_QUOTE)} characters`),
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

