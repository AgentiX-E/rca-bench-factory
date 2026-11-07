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

import { readFileSync } from 'node:fs';
import { progressCorpus } from './docs-corpus.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DOCS = [
  // Two headings, and they answer two different questions.
  //
  // `## Open` is the **live** list: what is not done now. There is one, in the index, and
  // it is maintained by hand -- an entry is added when the round that raises it declines
  // to close it, and struck when something closes it.
  //
  // `### Left open` is a **record**: what that round left undone, at that round. There are
  // fifty-seven of them and none is updated afterwards. The heading used to read `### Open`
  // in both places, which is how a reader grepping for what is open got 58 answers, one of
  // which was current (finding 207). Renaming was the repair; a rule in a comment would
  // have left the names lying.
  //
  // The guard checks the same two things of both: that each entry says which it is, and
  // that an open entry gives a reason long enough to be one. It cannot check that either
  // list is *current*, and does not pretend to.
  { path: 'docs/progress.md', headings: ['## Open', '### Left open'] },
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
    if (level > 0 && wanted.has(lines[index].trim())) {
      heads.push({ index, level, heading: lines[index].trim() });
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
  if (process.argv.includes('--doc')) return [source(doc.path)];
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
  for (const doc of DOCS) {
    const files = filesOf(doc);
    // Document-wide, not per section: the second list is usually written by copying
    // the first one's shape, so a sentence shared between them is the cheapest thing
    // to leave behind, and a per-section map would not see it. Document-wide now
    // means corpus-wide, because one round's list and another round's list are the
    // same list read at two times.
    const reasons = new Map();
    const live = [];
    const rounds = [];
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
    const found = sections(text, doc.headings);
    // The rounds this corpus says happened. Read from every file, because a volume is
    // where a round is written and the index is where the list is: the stamp has to be
    // comparable with the newest of them, and `--doc` makes that one file.
    for (const match of text.matchAll(/^## (v(\d+)\.(\d+))\b/gm)) {
      rounds.push({ round: match[1], major: Number(match[2]), minor: Number(match[3]) });
    }
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
      // Which list this is. The index's `## Open` is the live one; a volume's `### Left open`
      // is a record of one round. The distinction is used for one thing, below.
      const kind = section.heading === '## Open' ? 'live' : 'record';
      const items = entries(section.lines);
      if (items.length === 0) {
        problems.push(
          `${from.label}: the \`${section.heading}\` section ${index + 1} of ${found.length} is empty, ` +
            'so this guard has no subject',
        );
        return;
      }
      total += items.length;
      let openHere = 0;
      for (const item of items) {
        const headline = item.split('\n')[0];
        const first = headline.slice(2).trim();
        if (CLOSED.test(headline)) {
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
        const markers = [...item.matchAll(OPEN)];
        const open = markers.length === 0 ? null : markers[markers.length - 1];
        if (!open) {
          problems.push(
            `${from.label}: an entry says neither that it is closed nor why it is open, so a reader ` +
              `cannot tell work from history: ${first.slice(0, 80)}`,
          );
          continue;
        }
        openHere += 1;
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
    // The section count is printed beside the entry count, so a document that gains a
    // list cannot do it silently: the number of lists is part of the evidence.
    console.log(
      `check-open-list: OK (${total} entry(ies) across ${sectionsSeen} section(s) of ${files.length > 1 ? 'docs/progress.md and its volumes' : labelled}: ` +
        `${total - closed} open with a reason, ${closed} closed by a finding)`,
    );
    stampChecks({ live, rounds, problems });
  }

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

