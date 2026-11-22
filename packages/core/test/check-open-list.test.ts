import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { progressCorpus } from '../../../scripts/docs-corpus.mjs';
import { populationsOf, readVolumes } from '../../../scripts/progress-volumes.mjs';

/**
 * The Open list has now had three entries stop meaning anything, and the sentence
 * written after the first one says why: *"The line above stood for eleven passes
 * after that, because nothing reads an 'open' list."*
 *
 * Writing that sentence did not give the list a reader. Two more stale entries
 * accumulated behind it, and finding 159 measured both:
 *
 * - the `commits` count gate the list still asked for -- **the document publishes no
 *   `commits` count at all**, so the item had no subject;
 * - six scripts observed failing in run #174 -- in a job that no longer runs a
 *   suite, with both of the aggregates it does run measured green on a cold tree.
 *
 * `scripts/check-open-list.mjs` refuses an entry that does not say **which it is**:
 * closed (struck through, naming the finding) or open with a `[open: <reason>]` of
 * substance. It cannot check whether an entry is still *true* -- that needs the
 * measurement the entry is about -- and the file says so rather than looking like
 * more than it is.
 *
 * ## The defect this file found next: the guard read the first list
 *
 * Finding 161 appended a second `### Open` section, and the guard -- which located
 * its subject with `findIndex` -- went on judging the first one. The count it printed
 * did not move, and nothing in its output said a second list existed. A pass that
 * adds a residual list therefore had **no reader at all**, which is the same shape as
 * the three stale entries above, one level out: not an entry whose reader stopped,
 * but a reader that stops at the first list.
 *
 * The fixtures below are written for that: a clean first section and a dirty second
 * one, so the check is discriminating rather than merely quiet.
 */

/**
 * The scripts this file drives, declared because `gate-sites.json` reconciles the two
 * accounts: a site that names this file as its proof must be a script this file
 * actually spawns, and a script it spawns must be one it declares. Rule 7 of that
 * file found the omission -- the test spawned the guard and said nothing about it.
 */
const DRIVES = ['scripts/check-open-list.mjs'];

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-open-list.mjs');

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/**
 * Run the guard against a document written to a temp file.
 *
 * `--doc` exists for these tests. The alternative was to test the guard's predicates
 * by copying its two regexes into this file, which is what the first version of this
 * file did -- and a copy cannot answer the question this section is about, because
 * *which sections are read* is not a predicate. Two of the older fixtures below still
 * drive the copy, and the ones in `reads its subject, not a sample of it` drive the
 * script.
 */
function runOn(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'open-list-'));
  dirs.push(dir);
  const doc = join(dir, 'progress.md');
  writeFileSync(doc, body);
  const r = spawnSync('node', [SCRIPT, '--doc', doc], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * The entry, with an id, because both live lists require one and a fixture has to obey the
 * rule it is written to demonstrate.
 *
 * The token goes first, right after the bullet's `- `, and outside every mark the headline may
 * carry: `- O-001 · **The claim.**`. Inside the bold would read better and is wrong for two of
 * the three shapes the shipped lists use -- a struck entry's first `**` belongs to its closure,
 * not to its claim, so a helper that aimed at the bold would put the id in the middle of the
 * sentence that closed the entry and the guard would then say the entry had none.
 */
function withId(entry: string, n: number): string {
  const id = `O-${String(n).padStart(3, '0')}`;
  const [head = '', ...rest] = entry.split('\n');
  return [`- ${id} · ${head.slice(2)}`, ...rest].join('\n');
}

/**
 * One pass's `### Open` section, in the shape the shipped document uses.
 *
 * The reason is long enough to pass the length rule on purpose: a fixture that failed
 * for two reasons at once could not say which branch was reached.
 *
 * No ids here, and that is a rule rather than an oversight: a round's record is frozen, it
 * never moves an entry anywhere, and the 559 entries of the shipped records carry none. The
 * test at the end of this file holds that scope still.
 */
function openSection(title: string, entries: string[]): string {
  return `## ${title}\n\n### Left open\n\n${entries.join('\n')}\n`;
}

/**
 * The index's own shape: an `## Open` at the top of a document, closed by the next `## `.
 *
 * The second spelling, and the one that had no reader for as long as it existed. A
 * fixture written only with `### Open` cannot tell the two apart, which is why the four
 * tests below it use this instead.
 *
 * `from` is the first id, because the ids of the two lists are **one space**: a document that
 * carries both sections numbers them together, and numbering each from 1 would collide the
 * first entry of each -- the refusal the id rule exists for, reached by a fixture that is not
 * about it.
 */
function indexOpen(entries: string[], from = 1): string {
  return `## Headline\n\ntext\n\n## Open\n\n${entries.map((entry, i) => withId(entry, from + i)).join('\n')}\n\n## Pass log\n\nbody\n`;
}

const CLOSED_ENTRY = '- ~~An old item.~~ **Closed by finding 150**: the consumer arrived.';

/**
 * Run the guard over a **set** of record files, which is what the record became.
 *
 * `--doc` answers "the whole corpus is this one file" and every fixture above says it by carrying
 * `## Open` and `## Closed` together. A set is not a file, and the rule that reads it is the
 * discovery rule -- numbering, gaps, names -- so a fixture that wants a set has to hand the guard a
 * directory. `RCA_RECORD_DIR` is that hand, and the index still travels through `--doc`: two
 * switches, two subjects, and the ids they carry are one space because the space is a fact about
 * both lists (finding 570).
 *
 * The other alternative was a second `--doc`, which would have made the id space two file names
 * rather than one corpus, and the fixture would then have had to prove the very thing it assumed.
 */
function runOnRecord(files: Record<string, string>, body: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'open-list-record-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const doc = join(dir, 'progress.md');
  writeFileSync(doc, body);
  const r = spawnSync('node', [SCRIPT, '--doc', doc], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RCA_RECORD_DIR: dir, ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * The record's files on the shipped tree, counted from the disk rather than from a literal.
 *
 * A pinned fifty-two would have to be re-signed by every closure, and the set is the thing this
 * round is about: the test has to know which files are the record without asking the guard, or it
 * would agree with the guard about a file neither of them read.
 */
function shippedRecord(): { name: string; text: string }[] {
  const dir = resolve(ROOT, 'docs', 'progress');
  return readdirSync(dir)
    .filter((name) => name === 'closed.md' || /^closed-\d{2}\.md$/.test(name))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}


/**
 * The record's own shape: `## Closed` at the top of a document, closed by the next `## `.
 *
 * A closure used to be struck where it stood, and from v3.111 it moves here. Every fixture
 * below that is *about* a closed entry uses this, because the live list refuses a strike now:
 * a fixture that left one in `## Open` would be testing the refusal rather than the rule the
 * test names.
 */
function closedSection(entries: string[], from = 1): string {
  return `## Closed\n\n${entries.map((entry, i) => withId(entry, from + i)).join('\n')}\n`;
}

/**
 * The header the nineteen shipped table-form records use, in the shape markdown needs: the
 * column names, then the rule that draws the line under them. Two lines that are not rows --
 * which is finding 464, and which every fixture below has to supply for the row count to mean
 * what it says.
 */
const TABLE_HEAD = '| priority | item | state | next step |\n| --- | --- | --- | --- |';
const OPEN_ENTRY =
  '- A residual. [open: it needs the measurement the entry is about, and that measurement does not exist yet]';
const BARE_ENTRY = '- A residual with no marker at all.';

/**
 * Every table in a document whose first column is `priority`, and the rows under it.
 *
 * The property is the one the guard refuses on: a record is a table that starts with the
 * priority column whatever its heading says. Counting it here, from the corpus rather than from
 * a list of names, is the check that was missing on the day the record was renamed -- the
 * guard's count agreed with its own spelling table and nobody asked the corpus (finding 579).
 *
 * Deliberately not `cellsOf`: this counts a header's first cell and the pipe lines under the
 * rule, which is all a census needs, and a copy of the reader would agree with the reader.
 */
function priorityTables(text: string): { tables: number; rows: number } {
  const lines = text.split('\n');
  let tables = 0;
  let rows = 0;
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i] ?? '') || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue;
    const first = (lines[i] ?? '').trim().replace(/^\|/, '').split('|')[0]?.trim().toLowerCase();
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j] ?? '')) j += 1;
    if (first === 'priority') {
      tables += 1;
      rows += j - (i + 2);
    }
    i = j;
  }
  return { tables, rows };
}

/**
 * The sections that are records because their **body** is one, and whose heading the five names miss.
 *
 * The second half of the shape space. `priorityTables` counts the tables that begin with a
 * `priority` column -- the property the guard refuses a record on -- and this counts the sections
 * that hold nothing but entries and are named none of the names the corpus uses. Taken from the
 * corpus rather than from a sixth string, for the reason `priorityTables` gives: a census that
 * enumerates the names goes blind on the same day as the guard (finding 579), and this one is
 * about the day it goes blind on the *body* (finding 586).
 *
 * The predicate is deliberately the plain one -- no prose at column zero, and at least one bullet
 * whose headline is not struck and which carries a reason -- and not a call into the guard.
 */
function listOnlyRecords(): number {
  const named = (heading: string) =>
    heading === '## Open' ||
    heading === '### Left open' ||
    /^### (?:Left open|Leftovers|What is left),/.test(heading);
  let count = 0;
  for (const file of progressCorpus()) {
    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const head = /^(#{2,3}) (.*)$/.exec(lines[i] ?? '');
      if (head === null) continue;
      const level = (head[1] ?? '').length;
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j += 1) {
        const one = /^(#+)\s/.exec(lines[j] ?? '');
        if (one !== null && (one[1] ?? '').length <= level) {
          end = j;
          break;
        }
      }
      const body = lines.slice(i + 1, end);
      if (named(lines[i]?.trim() ?? '')) continue;
      const prose = body.some((line) => {
        if (line.trim() === '') return false;
        if (/^- /.test(line)) return false;
        if (/^\s/.test(line)) return false;
        if (/^---+\s*$/.test(line)) return false;
        if (/^#+\s/.test(line)) return false;
        return true;
      });
      if (prose) continue;
      const open = body.filter((line) => /^- /.test(line)).some((line) => /\[open:/.test(line) && !/~~/.test(line));
      if (open) count += 1;
    }
  }
  return count;
}

/**
 * A count read out of a sentence, with the boundary in front of it (finding 589).
 *
 * ## The zero that was a digit of thirty
 *
 * The test below this helper asserted `toContain('0 closed by a finding')` and its comment said
 * the live list closes nothing. The line it read says **30** closed, and `30 closed by a finding`
 * contains `0 closed by a finding`, so the assertion passed from the round that wrote it until
 * the round that changed the noun beside it -- it was a claim about a number that could not
 * distinguish its subject from the last digit of another.
 *
 * A count in a sentence is the number between a delimiter and its label, so this reads one: a
 * digit run that is not preceded by a digit, and the label right after it. `30 closed` reads
 * thirty and `130 closed` reads a hundred and thirty, which is the property a bare `toContain`
 * cannot have.
 *
 * @param line one line of a gate's output
 * @param label the words the count stands in front of
 * @returns the number, asserted to be there rather than defaulted
 */
function countIn(line: string, label: string): number {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(?:^|[^\\d])(\\d+) ${escaped}`).exec(line);
  expect(found, `no count stands in front of "${label}" in: ${line}`).not.toBeNull();
  return Number((found ?? [])[1]);
}

/**
 * The record's closures, split by the authority each bullet names (finding 588).
 *
 * ## What this is, and what it is not
 *
 * It is the record read a second time, over the one file the closures live in, and it exists to
 * hold the published split to the corpus. It is **not** the definition of the rule: the three
 * fixtures in the describe below state the rule as behaviour -- which authority wins when a
 * sentence names two, and what "without a finding" outranks -- and they are what goes red if the
 * precedence moves. What this side adds is the count, which no fixture can state: the record's
 * 56 closures are 43 findings, 10 rounds and 3 denials, and a line that printed one number under
 * one authority's name could not be asked whether that was still true.
 *
 * The window and the precedence are deliberately the same words as the guard's, because a second
 * reading of a rule that disagreed with the first would be a second rule. The division is:
 * fixtures pin the rule, this pins the numbers.
 */
function authorityTally(): { finding: number; round: number; none: number } {
  const tally = { finding: 0, round: 0, none: 0 };
  // A period followed by whitespace ends the sentence; the one inside `v3.81` does not (finding
  // 590). Written as the same lookahead the guard uses, for the reason the docstring above gives.
  const closure = String.raw`(?:Closed|Narrowed|Retracted)\b(?:(?!\.\s)[\s\S]){0,120}?`;
  for (const file of shippedRecord()) {
    let bullet: string | null = null;
    const flush = () => {
      if (bullet === null) return;
      const text = bullet;
      bullet = null;
      if (!/~~/.test(text.split('\n')[0] ?? '')) return;
      if (new RegExp(`${closure}\\bfinding\\s+\\d+`).test(text)) tally.finding += 1;
      else if (/Closed without a finding|Closed in this pass/.test(text)) tally.none += 1;
      else if (new RegExp(`${closure}\\b(?:Pass\\s+\\d+|v\\d+\\.\\d+)`).test(text)) tally.round += 1;
    };
    for (const line of file.text.split('\n')) {
      if (/^- /.test(line)) {
        flush();
        bullet = line;
        continue;
      }
      if (/^\s+\S/.test(line) && bullet !== null) {
        bullet += `\n${line}`;
        continue;
      }
      if (/^\S/.test(line)) flush();
    }
    flush();
  }
  return tally;
}

/**
 * There was a copy of the guard's two regexes here, and five tests drove it.
 *
 * It is gone, and finding 203 is why: the guard's closure rule was `/~~|Closed by
 * finding \d+/`, satisfied by a strikethrough alone, and the copy made the tests pass
 * for exactly the same reason the guard did. When the rule was tightened the copy
 * stayed where it was -- a test suite that agrees with a stale duplicate of the
 * implementation is a suite that reports on its own source. Every rule below is
 * therefore driven through `runOn`, which spawns the script, so there is one
 * vocabulary and it is the shipped one. The three fixture strings stay.
 */

describe('docs · the shipped list, as the guard reads it', () => {
  it('reads the shipped document and finds the two it closed', () => {
    // Non-vacuity for the fixtures above: the shipped file is judged by the same
    // predicates, so a document that reverted to plain prose would fail here.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(`${shipped.stdout}${shipped.stderr}`).toContain('check-open-list: OK');
    expect(shipped.status).toBe(0);
    // And the count is stated, so an empty list cannot pass as a clean one -- and it
    // is read as *arithmetic* rather than as a literal. A pinned `6 entry(ies)` would
    // have to be re-signed by every pass that appends a section, and a number that is
    // re-signed on every unrelated edit is a number nobody reads. The section count is
    // instead held to the document's own headings, counted here from the file, and the
    // entry count to the two parts it is made of.
    const summary = shipped.stdout.match(
      /check-open-list: OK \((\d+) entry\(ies\) across (\d+) of (\d+) section\(s\) of docs\/progress\.md(?: and its volumes)?: (.+)\)\n/,
    );
    expect(summary, `the guard's summary changed shape: ${shipped.stdout}`).not.toBeNull();
    const entries = Number(summary?.[1] ?? 0);
    // Two numbers for the sections, because a section of a record in table form holds rows and not
    // entries: `179 of 226` is the walk's coverage and the population the entries were drawn from,
    // and the division a reader would make of 627 by 226 is over 47 sections that hold none of
    // them (finding 602).
    const sections = Number(summary?.[3] ?? 0);
    const entrySections = Number(summary?.[2] ?? 0);
    // The populations the line separates, read from the line itself (finding 602). An entry of
    // the live list is work; an entry of a round's record is the same work as it stood at that
    // round. The line pooled them into one number labelled "open with a reason" -- 597, over a
    // list that held 37 -- so the two numbers here are read apart, and the whole is held to
    // their sum below.
    const buckets = summary?.[4] ?? '';
    const liveOpen = Number(/(\d+) open in the live list/.exec(buckets)?.[1] ?? 0);
    const restatedOpen = Number(/(\d+) open restated in the log's records/.exec(buckets)?.[1] ?? 0);
    const closedBucket =
      /(\d+) closed in the (?:live list|log's records|record of closures) \((\d+) by a finding, (\d+) by a round, (\d+) without one\)/.exec(
        buckets,
      );
    const closed = Number(closedBucket?.[1] ?? 0);
    // The three the line separates, and the sum it publishes as their total (finding 588). The
    // arithmetic below is what makes the last one a reading rather than a fourth number: the
    // guard sums the three, so a total that disagreed with them would be a defect on its own,
    // and a noun that named one of the three would be invisible to this test for as long as the
    // arithmetic held -- which is exactly how long it was invisible.
    const byFinding = Number(closedBucket?.[2] ?? 0);
    const byRound = Number(closedBucket?.[3] ?? 0);
    const withoutOne = Number(closedBucket?.[4] ?? 0);
    // Both buckets are non-empty on the shipped corpus, so neither half of the split is a
    // constant: a line that dropped the restatements would pass every other assertion here.
    expect(liveOpen, 'the live list holds nothing, so the bucket below is a constant zero').toBeGreaterThan(0);
    expect(restatedOpen, 'the log holds no restatement, so the split is untested').toBeGreaterThan(0);
    // And the word the line used to hang on the pooled count is gone from the output entirely:
    // a noun that came back would satisfy every arithmetic assertion above, because 597 = 37 +
    // 560 is also arithmetic. This is the assertion the old line could not have.
    expect(shipped.stdout, 'a pooled count is labelled "open with a reason" again').not.toContain('open with a reason');
    // The corpus, not one path: the lists moved into the volumes with the rounds
    // they belong to (finding 197), and a test that counted headings in the index
    // alone would compare the guard's 47 against the index's 1.
    // Both spellings, and the union is the point: `## Open` is the index's live list
    // and `### Left open` is the list a round closes with, and the guard read one of them
    // until finding 203 -- 19,285 bytes of the other had no reader at all. A count
    // written as `=== '### Left open'` here would have agreed with the guard while both
    // ignored the same twelve entries.
    // Five spellings, because the guard reads five: the live list, a record of entries, and three
    // records written as tables. The comment here said "three" for as long as the guard read three,
    // and the corpus had five -- `### Leftovers, in the order that reaches the goal` and
    // `### What is left, in the order it has to happen` were written by 22 rounds and read by
    // nothing (finding 579). A test that enumerates the names a guard knows is a test that goes
    // blind on the same day, which is why the count below is taken from the body as well.
    const named = progressCorpus()
      .flatMap((file) => file.text.split('\n'))
      .map((line) => line.trim())
      .filter(
        (trimmed) =>
          trimmed === '## Open' ||
          trimmed === '### Left open' ||
          /^### (?:Left open|Leftovers|What is left),/.test(trimmed),
      );
    const headings = named.length;
    // And of those, the ones that hold rows instead of entries. The guard counts them on their own
    // line -- a record in table form is rows, and its entries would be refused -- so the section
    // count in the summary is the sections that hold what it is counting (finding 602).
    const rowSections = named.filter((one) => /^### (?:Left open|Leftovers|What is left),/.test(one)).length;
    // And the sixth name is not a name: `### Not fixed here` is a record because its **body** is
    // nothing but entries, and the count here is taken from that property rather than from a sixth
    // string -- a census that enumerated it would go blind on the same day the guard did (finding
    // 586). `listOnlyRecords` counts the sections whose heading the five names miss.
    const byBody = listOnlyRecords();
    expect(byBody, 'the corpus holds no record whose heading the five names miss, so the census is vacuous').toBeGreaterThan(0);
    expect(sections, 'the guard read a different number of lists than the document has').toBe(headings + byBody);
    expect(rowSections, 'the corpus holds no record in table form, so the split below is untested').toBeGreaterThan(0);
    expect(entrySections, 'the guard counted a different number of entry-holding sections than the corpus has').toBe(
      headings + byBody - rowSections,
    );
    expect(entries, 'the parts do not add up to the whole').toBe(liveOpen + restatedOpen + closed);
    // The rows a record carries are not entries: a record's rows are counted on their own
    // line, because they are a different kind of object -- the log states them separately and so
    // does the guard, and a document whose records held entries would be refused by the arm that
    // reads them.
    //
    // And the line says **of how many** (finding 603). It printed `47 record(s) in table form`
    // under a line that printed `226 record(s)`, one noun over two populations and no word saying
    // one is inside the other: 47 + 226 describes nothing, and 47 of 226 is the corpus. The
    // denominator is the population, so the assertion is not that the number is fixed -- it is
    // that the number printed here **is** the number printed there. A subset that quotes a
    // denominator of its own is the defect; a subset that quotes the whole's is the repair, and
    // the equality below is the only line that can tell them apart.
    const counted = /(\d+) of (\d+) record\(s\) are in table form \((\d+) row\(s\)\)/.exec(shipped.stdout);
    expect(counted, `the table-form line lost its denominator: ${shipped.stdout}`).not.toBeNull();
    const recordLine = /(\d+) record\(s\): \d+ under a round and \d+ under none/.exec(shipped.stdout);
    expect(recordLine, 'the record population has no line to compare the subset with').not.toBeNull();
    expect(Number(counted?.[2]), "the subset's denominator is not the record population printed above it").toBe(
      Number(recordLine?.[1]),
    );
    // The count of record tables, taken from the body rather than from the names. The line above
    // accepts any number; this one holds that number to the corpus, so a heading the guard does
    // not know is a red test on the day the round that renames it is written (finding 579).
    const corpus = progressCorpus().reduce(
      (all, file) => {
        const one = priorityTables(file.text);
        return { tables: all.tables + one.tables, rows: all.rows + one.rows };
      },
      { tables: 0, rows: 0 },
    );
    expect(Number(counted?.[1]), 'the guard counted a different number of record tables than the corpus holds').toBe(
      corpus.tables,
    );
    expect(Number(counted?.[3]), 'the guard counted a different number of rows than those tables hold').toBe(
      corpus.rows,
    );
    // Non-vacuity of the `of`: a corpus in which every record were a table would print
    // `226 of 226` and prove nothing about the subset. The shipped log has records of both
    // forms -- which is why the denominator is not a constant 1 either way.
    expect(Number(counted?.[1]), 'every record is a table, so the subset is the whole and the `of` is untested').toBeLessThan(
      Number(counted?.[2]),
    );
    // Non-vacuity in both directions: the corpus holds more record tables than the two spellings
    // v3.114 could read (25), and more than one of the names, so neither side of the comparison is
    // a constant.
    expect(corpus.tables).toBeGreaterThan(25);
    expect(corpus.rows).toBeGreaterThan(corpus.tables);
    // Non-vacuity in the other direction: the shipped document has at least one
    // closure, so the count is a reading rather than a constant zero.
    expect(closed).toBeGreaterThan(0);
    // And the total is the three the line names, added up (finding 588). This is the one
    // relationship the old line could not be asked: it published a single number under one
    // authority's name, so `closed` was checked for being positive and for summing with `open`,
    // and neither question is about what it counts.
    expect(byFinding + byRound + withoutOne, 'the three authorities do not add up to the total').toBe(closed);
  });

  it('prints the live list\u2019s own number twice, and the two lines cannot disagree', () => {
    // Two readers of one number, forty lines apart, and until v3.122 they were both called "open"
    // while counting different populations: the summary said 597, the stamp said 37 (finding 602).
    // The assertion is the comparison a reader makes, taken from the guard's own output rather than
    // from a literal, so a line that moved without the other would red here rather than at the next
    // reading of the file.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(shipped.status, `${shipped.stdout}${shipped.stderr}`).toBe(0);
    const summary = shipped.stdout
      .split('\n')
      .find((one) => one.includes('of docs/progress.md and its volumes:'));
    expect(summary, `the guard printed no line for the live list: ${shipped.stdout}`).toBeDefined();
    const bucket = /(\d+) open in the live list/.exec(summary ?? '');
    const stamp = /holds (\d+) open entr\(ies\)/.exec(shipped.stdout);
    expect(bucket, 'the summary no longer names the live list').not.toBeNull();
    expect(stamp, 'the live list no longer states how many entries it holds').not.toBeNull();
    expect(Number(bucket?.[1]), 'the summary and the stamp disagree about the live list').toBe(Number(stamp?.[1]));
  });

  it('names a bucket only for a kind the document holds, so a record of closures prints no live count', () => {
    // The line is a partition over the kinds the walk met. A document that is nothing but the record
    // of closures has no live list to hold anything, and printing `0 open in the live list` over it
    // would be a sentence about a section that does not exist -- true, and noise a reader has to
    // discount. The three lines that carry a bucket are the three kinds, and nothing else is named.
    const r = runOn(closedSection([CLOSED_ENTRY]));
    expect(r.code, r.out).toBe(0);
    const line = r.out.split('\n').find((one) => one.includes('entry(ies) across'));
    expect(line).toBeDefined();
    expect(line).toContain('1 closed in the record of closures (1 by a finding, 0 by a round, 0 without one)');
    expect(line, 'a document with no live list printed a live count').not.toContain('in the live list');
    expect(line, 'a document with no record printed a restatement count').not.toContain('restated');
  });

  it('calls a live list\u2019s entry open, and never pools it with a record\u2019s restatement', () => {
    // The smallest corpus that has both kinds: one live entry, and a round whose record restates it.
    // The line has to say 1 and 1, and the total has to be their sum, or the number a reader takes
    // away is the pooled 2 that the word "open" used to carry.
    const body =
      '## Headline\n\ntext\n\n## Open\n\n' +
      `${withId(`- A promise. [open: a reason long enough to stand as a reason here]`, 1)}\n\n` +
      'Checked at v9.9: **1** entries open\n\n## Pass log\n\nbody\n\n' +
      '## v9.9 — a round\n\n### Left open\n\n- A promise. [open: a reason long enough to stand as a reason here]\n';
    const r = runOn(body);
    expect(r.code, r.out).toBe(0);
    const line = r.out.split('\n').find((one) => one.includes('entry(ies) across')) ?? '';
    expect(line).toContain('2 entry(ies) across 2 of 2 section(s)');
    expect(line).toContain('1 open in the live list; 1 open restated in the log');
    expect(line, 'the live list and the record were pooled into one count again').not.toContain('open with a reason');
  });

  it('declares the script it spawns, because gate-sites rule 7 reconciles it', () => {
    expect(DRIVES).toEqual(['scripts/check-open-list.mjs']);
    const sites = JSON.parse(
      spawnSync('node', ['-e', 'process.stdout.write(require("fs").readFileSync("golden-master/gate-sites.json","utf8"))'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout,
    ) as { sites: { script: string }[] };
    expect(sites.sites.some((site) => site.script === 'scripts/check-open-list.mjs')).toBe(true);
  });
});

describe('docs · the guard reads its subject, not the first sample of it', () => {
  it('reads every Open list, not only the first one', () => {
    // The fixture is the defect: a clean first section and a second one whose entry
    // says neither. While the guard used `findIndex`, the second list had no reader
    // and this document passed.
    const r = runOn(openSection('Pass 1', [CLOSED_ENTRY]) + openSection('Pass 2', [BARE_ENTRY]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('says neither that it is closed nor why it is open');
    expect(r.out).toContain('A residual with no marker at all.');
  });

  it('judges a reason by whether it is a placeholder, in whichever section it sits', () => {
    const r = runOn(openSection('Pass 1', [OPEN_ENTRY]) + openSection('Pass 2', ['- Something. [open: still to do]']));
    expect(r.code).toBe(1);
    expect(r.out).toContain('is not a reason');
  });

  it('refuses one reason shared by two sections, because one of the two is a placeholder', () => {
    // Scoped document-wide rather than per section: the second list is written by
    // copying the first one's shape, so a shared sentence is the cheapest thing to
    // leave behind, and per-section uniqueness would not see it.
    const shared = OPEN_ENTRY.replace('- A residual. ', '- Another residual. ');
    const r = runOn(openSection('Pass 1', [OPEN_ENTRY]) + openSection('Pass 2', [shared]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('two entries share an open reason');
  });

  it('refuses a section that exists and says nothing', () => {
    const r = runOn(openSection('Pass 1', [OPEN_ENTRY]) + '## Pass 2\n\n### Left open\n');
    expect(r.code).toBe(1);
    expect(r.out).toContain('is empty, so this guard has no subject');
  });

  it('reports how many sections it read, so a second list cannot hide behind the first', () => {
    const r = runOn(openSection('Pass 1', [OPEN_ENTRY]) + openSection('Pass 2', [CLOSED_ENTRY]));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/2 entry\(ies\) across 2 of 2 section\(s\)/);
  });

  it('still refuses a document whose list is gone, rather than reporting zero entries', () => {
    const r = runOn('## Pass 1\n\nNothing here.\n');
    expect(r.code).toBe(1);
    expect(r.out).toContain('the list this guard reads is gone');
  });

  it('reads `## Open` as well as `### Left open`, because the index uses the first', () => {
    // The defect, as a fixture: before finding 203 this document had no reader -- the
    // guard's table named one heading, and the index's live list was 19,285 bytes of
    // the other. The entry below is deliberately dirty, so a green here would mean the
    // section was skipped rather than read and found clean.
    const r = runOn(indexOpen([BARE_ENTRY]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('says neither that it is closed nor why it is open');
    // And the clean version is green, which is the half that says the section is read
    // rather than merely refused.
    const clean = runOn(indexOpen([OPEN_ENTRY]));
    expect(clean.code).toBe(0);
    expect(clean.out).toMatch(/1 entry\(ies\) across 1 of 1 section\(s\)/);
  });

  it('refuses a closure that does not say what closed it', () => {
    // The rule the docstring promised and the regex did not enforce: `~~` alone passed,
    // so "~~something old~~" was a closure whose authority nobody could check. Eleven
    // of the twenty shipped closures could not have satisfied the strict version
    // either -- their citation wraps a line break -- which is why the pattern needs
    // `\s+` and why this fixture is one entry, not a document.
    const r = runOn(closedSection(['- ~~An old item, struck through and otherwise silent.~~']));
    expect(r.code).toBe(1);
    expect(r.out).toContain('does not say what closed it');
  });

  it('accepts the three authorities a closure can have', () => {
    const cases = [
      '- ~~An old item.~~ **Closed by finding 150**: the consumer arrived.',
      '- ~~An old item.~~ **Closed by finding\n  170**: the citation wraps, as eleven of them do.',
      '- ~~An old item.~~ **Closed by Pass 15**, which recorded the first real reading.',
      '- ~~An old item.~~ **Closed without a finding: the fix was in a scratch helper outside this tree, and the entry records it.**',
    ];
    for (const entry of cases) {
      const r = runOn(closedSection([entry]));
      expect(r.code, `${entry} was refused: ${r.out}`).toBe(0);
    }
  });

  it('accepts a live entry and a record that share a reason, because that is a carry-forward', () => {
    // The scope of the duplicate rule is one kind, and this is why. A residual that a round
    // raised and the live list still carries has the same reason in both places by
    // construction; refusing that would make the live list unable to name anything a round
    // had already named, which is most of what it names.
    const reason = 'a residual long enough to pass the length rule and short enough to repeat';
    const entry = (lead: string) => `- ${lead}. [open: ${reason}]`;
    const r = runOn(`${indexOpen([entry('live')])}\n${openSection('Pass 1', [entry('record')])}`);
    expect(r.code, r.out).toBe(0);
  });

  it('no longer reads the heading the volumes used to call Open', () => {
    // Finding 207's repair was a rename, and this is the test that would notice a revert: a
    // document that went back to `### Open` now has no list the guard reads, which is the
    // right answer -- the old name is exactly the ambiguity the rename removed.
    const r = runOn('## Pass 1\n\n### Open\n\n- A residual. [open: a reason long enough to pass the rule here]\n');
    expect(r.code).toBe(1);
    expect(r.out).toContain('the list this guard reads is gone');
  });

  it('refuses a list inside a list, rather than counting its entries twice', () => {
    // Reachable only because two levels are read now. An entry counted in both a
    // `## Open` and the `### Left open` it sits inside makes `N open with a reason` a number
    // that depends on how the document is headed rather than on how much is open.
    const nested =
      `## Open\n\n${withId(OPEN_ENTRY, 1)}\n\n### Left open\n\n${CLOSED_ENTRY}\n\n## Pass log\n\nbody\n`;
    const r = runOn(nested);
    expect(r.code).toBe(1);
    expect(r.out).toContain('sits inside the');
    expect(r.out).toContain('counted twice');
  });
});

/**
 * The list's currency, and the count that exposed how it was being counted.
 *
 * v3.61 closed three of the shipped list's entries and struck none of them: the list went on
 * saying "open" about a page that had been made a page (finding 451), about a flag whose other
 * half had been read (finding 446), and about a creation path that a real push had paid for
 * (finding 455). A fourth `[open: ...]` was parked *inside* an entry that had been struck
 * through, where neither a reader nor this guard looks.
 *
 * The repair is not another sentence about reading the list. It is a line at the top of it:
 * which round read it, and how many entries it found open. This guard recomputes the number
 * from the entries below the line and refuses a round older than the newest round the corpus
 * names -- so a round that writes itself up without opening this file turns the build red.
 *
 * What it still cannot do is check that a surviving entry is *true*. That takes the
 * measurement the entry is about, and a line of arithmetic cannot take one. The tests below
 * are about the arithmetic.
 */
describe('docs · the live list says when it was read, and how much it holds', () => {
  const ROUND = '## v3.62 -- the round that read it';
  const withStamp = (entries: string[], stamp: string | null) =>
    `${ROUND}\n\nbody\n\n## Open\n\n${stamp === null ? '' : `${stamp}\n\n`}${entries.map((entry, i) => withId(entry, 1 + i)).join('\n')}\n\n## Pass log\n\nbody\n`;

  it('passes when the stamp names the newest round and counts the entries below it', () => {
    // The closed entry is in the record, which is a second section of the same document: the
    // stamp counts the live list, and the record is not part of that count even when the two
    // files are one fixture.
    const r = runOn(withStamp([OPEN_ENTRY], 'Checked at v3.62: **1** entry open.') + closedSection([CLOSED_ENTRY], 2));
    expect(r.out).toContain('the live list was read at v3.62 and holds 1 open entr(ies)');
    expect(r.out).toContain('the newest round this corpus names is v3.62');
    expect(r.code).toBe(0);
  });

  it('refuses a number that is not the count of the entries below the line', () => {
    // The number is the whole point: it is what a reader compares against their own count.
    const second = '- Another residual. [open: and another reason, long enough to be one of these]';
    const r = runOn(withStamp([OPEN_ENTRY, second], 'Checked at v3.62: **1** entry open.'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('says 1 entr(ies) open and the section holds 2');
    expect(r.out).toContain('not counted from the entries it stands for');
  });

  it('refuses a stamp older than the newest round in the corpus', () => {
    // This is the mechanism the three stale entries needed: the round that closed them wrote
    // itself up and left the list alone, and nothing anywhere noticed.
    const r = runOn(withStamp([OPEN_ENTRY], 'Checked at v3.61: **1** entry open.'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('was last read at v3.61');
    expect(r.out).toContain('names a round at v3.62');
    expect(r.out).toContain('without reading the list');
  });

  it('refuses a live list that carries no stamp, when the corpus names a round to check it against', () => {
    const r = runOn(withStamp([OPEN_ENTRY], null));
    expect(r.code).toBe(1);
    expect(r.out).toContain('carries no currency stamp');
    expect(r.out).toContain('Checked at v3.62');
  });

  it('refuses two stamps, because "when was this list read" would have two answers', () => {
    const r = runOn(withStamp([OPEN_ENTRY], 'Checked at v3.62: **1** entry open.\n\nChecked at v3.61: **1** entry open.'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('carries 2 currency stamps');
  });

  it('says it had nothing to compare against, rather than passing quietly over a list nobody was asked to read', () => {
    // Every fixture above this block is this shape: no round heading anywhere. The rule cannot
    // be enforced there, and the output says which rule was not enforced and why.
    const r = runOn(indexOpen([OPEN_ENTRY]));
    expect(r.code).toBe(0);
    expect(r.out).toContain('carries no currency stamp, and this corpus names no round to check it against');
  });

  it('counts an entry as open when only a sentence inside it is struck through', () => {
    // Finding 458, and the count above is what found it: the closed test looked for a
    // strikethrough *anywhere* in the entry, so an entry that quotes a sub-item another round
    // closed was counted as history -- and its own reason was never read, for length or for
    // being a copy of another one. Two entries in the shipped list were in exactly that state.
    const quoted = [
      '- A residual that quotes a closure inside itself.',
      '  ~~[open: an old sub-item]~~ Closed by finding 343, which settled the sub-item only.',
      '  [open: the entry itself is still open, and this is the sentence that says why it is]',
    ].join('\n');
    const r = runOn(indexOpen([quoted]) + closedSection([CLOSED_ENTRY], 2));
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 open in the live list; 1 closed in the record of closures (1 by a finding, 0 by a round, 0 without one)');
  });

  it('reads the reason of such an entry, so a placeholder inside one is still refused', () => {
    const quoted = [
      '- A residual that quotes a closure inside itself.',
      '  ~~[open: an old sub-item]~~ Closed by finding 343.',
      '  [open: short]',
    ].join('\n');
    const r = runOn(indexOpen([quoted]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('the open reason is 5 character(s)');
  });
});

/**
 * The two sentences in one bullet, and the round that read one of them.
 *
 * v3.62 fixed the direction it could see: a strikethrough *anywhere* in an entry closed it,
 * so two live entries that quote a closed sub-item were counted as history. The repair was
 * "the headline decides", and it left the mirror untouched -- an entry whose **own reason**
 * is struck, with a headline that is not. Two entries in the shipped list are in exactly
 * that state, and each of them ends by naming the finding that closed it:
 *
 * | entry | its last sentence | counted as |
 * | --- | --- | --- |
 * | the reading that was sharp for two thirds of the sites | `~~[open: ...]~~ Closed by finding 343` | **open** |
 * | the RE3 slice's own fault categories | `~~[open: ...]~~ Closed by finding 344` | **open** |
 *
 * So the list said thirteen and the file said eleven, and the guard agreed with neither
 * sentence: it read a struck reason as a live one, because a reason was only ever read for
 * its length. The shape that would have been right is **older than the defect** -- round
 * v2.44 in `volume-05.md` strikes the headline *and* the reason and puts the closure after
 * them -- which is why the repair is to use the whole shape rather than to invent one.
 *
 * The rule is that the two sentences agree, in both directions: a closed entry may not
 * carry a reason a reader would act on, and an open entry may not have its reason struck.
 */
describe('docs · the headline and the reason have to agree about whether an entry is closed', () => {
  // The shipped defect, in fixture form: the reason struck, the closure named, the headline
  // as it was published -- an unstruck claim.
  const HALF_STRUCK = [
    '- A residual whose caveat was settled a round later.',
    '  ~~`[open: the enumeration gate and the skip paragraph disagree about whether a contract skip is a gap]`~~',
    '  **Closed by finding 343**, which found that the runner could not produce a refusal at all.',
  ].join('\n');

  it('refuses an entry whose own reason is struck through and whose headline is not', () => {
    const r = runOn(indexOpen([HALF_STRUCK, OPEN_ENTRY]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('says it is open and closed at once');
    expect(r.out).toContain('A residual whose caveat was settled a round later.');
  });

  it('accepts the same entry once its headline is struck too, and only in the record', () => {
    // Non-vacuity for the rule above: the only change is the headline's `~~`, so a guard that
    // refused the fixture for any other reason would fail here.
    //
    // And the entry belongs to `## Closed` now: the same text under `## Open` is refused by the
    // live list's own rule, which is the assertion below this one rather than a coincidence.
    const whole = HALF_STRUCK.replace(
      '- A residual whose caveat was settled a round later.',
      '- ~~A residual whose caveat was settled a round later.~~',
    );
    const r = runOn(closedSection([whole]) + indexOpen([OPEN_ENTRY], 2));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open in the live list; 1 closed in the record of closures (1 by a finding, 0 by a round, 0 without one)');
  });

  it('refuses a closed entry that still carries a reason a reader would act on', () => {
    // The other direction, and it is not symmetry for its own sake: a struck headline over a
    // live `[open: ...]` is the shape finding 458's four sites were in -- history in the
    // headline, work in the body, and whichever sentence a reader reached first decided what
    // they did.
    const both = [
      '- ~~A residual that was closed.~~ **Closed by finding 343**, which settled it.',
      '  [open: and yet this sentence still asks a reader to do the work]',
    ].join('\n');
    const r = runOn(closedSection([both]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('history in its headline and as work in its body');
  });

  it('still reads a live entry that quotes a struck reason inside itself as open', () => {
    // Finding 458's fixture, kept because the new rule reads the *last* marker: a guard that
    // looked for a struck reason anywhere in the entry would refuse this one, which is the
    // defect that started this family.
    const quoted = [
      '- A residual that quotes a closure inside itself.',
      '  ~~[open: an old sub-item]~~ Closed by finding 343, which settled the sub-item only.',
      '  [open: the entry itself is still open, and this is the sentence that says why it is]',
    ].join('\n');
    const r = runOn(indexOpen([quoted]) + closedSection([CLOSED_ENTRY], 2));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open in the live list; 1 closed in the record of closures (1 by a finding, 0 by a round, 0 without one)');
  });
});

/**
 * A closure names one of three authorities, and the line now says which (finding 588).
 *
 * The rule accepted all three from the round that wrote it; the population line published the
 * total as *"closed by a finding"*, which is one of the three names for a set of three things.
 * The four fixtures state the precedence, and the last test holds the shipped split to the
 * record's own bullets.
 */
describe('docs · a closure names one of three authorities, and the line says which', () => {
  const BY_ROUND = '- ~~An old item.~~ **Closed by v3.78**, which is the case and the measurement.';
  const WITHOUT = '- ~~An old item.~~ **Closed without a finding**: the fix was in a scratch helper outside this tree.';

  it('counts the three apart, and publishes each beside the total', () => {
    const r = runOn(indexOpen([OPEN_ENTRY], 1) + closedSection([CLOSED_ENTRY, BY_ROUND, WITHOUT], 2));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open in the live list; 3 closed in the record of closures (1 by a finding, 1 by a round, 1 without one)');
  });

  it('counts an entry once, under the finding, when its sentence names a round as well', () => {
    // `Closed at v3.97 by finding 540` is one closure with two names in it. The round is where the
    // finding was filed; the finding is what a reader can check against a heading, so it wins.
    const both = '- ~~An old item.~~ **Closed at v3.97 by finding 540**, which read the row it refused.';
    const r = runOn(indexOpen([OPEN_ENTRY], 1) + closedSection([both], 2));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open in the live list; 1 closed in the record of closures (1 by a finding, 0 by a round, 0 without one)');
  });

  it('reads a citation that arrives after a version, because a version\u2019s period is not a full stop', () => {
    // O-057's own sentence: the closure names the round it happened in and the finding it was,
    // and the finding is 48 characters past the verb -- behind a `.` that belongs to `v3.81`. The
    // window stopped there and the arm filed the closure under the round (finding 590).
    const afterVersion =
      '- ~~An old item.~~ **Closed at v3.81 by measuring it and replacing the shape (finding 511).** ' +
      'The reading came from a probe that names the module it measured.';
    const r = runOn(indexOpen([OPEN_ENTRY], 1) + closedSection([afterVersion], 2));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open in the live list; 1 closed in the record of closures (1 by a finding, 0 by a round, 0 without one)');
  });

  it('still refuses a citation in the sentence after the closure', () => {
    // The other side of the same boundary, and the reason the window exists at all: a closure
    // followed by a sentence about some other finding does not cite it.
    const later =
      '- ~~An old item.~~ **Closed by the workflow.** Finding 150 later found something else in the ' +
      'same file, and that is a different item.';
    const r = runOn(indexOpen([OPEN_ENTRY], 1) + closedSection([later], 2));
    expect(r.code).toBe(1);
    expect(r.out).toContain('does not say what closed it');
  });

  it('reads "without a finding" as the denial it is, and not as the round named after it', () => {
    // The third authority is the writer's own sentence, and a version in the sentence that
    // follows it is not a closure. Reading the two in the other order made the record's three
    // denials into three rounds -- the same error as the line's noun, one level down.
    const denial =
      '- ~~An old item.~~ **Closed without a finding**: the fix landed in a scratch helper outside ' +
      'this tree, and v3.121 will need it again.';
    const r = runOn(indexOpen([OPEN_ENTRY], 1) + closedSection([denial], 2));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 closed in the record of closures (0 by a finding, 0 by a round, 1 without one)');
  });

  it('still refuses a closure that names none of the three', () => {
    const bare = '- ~~An old item.~~ The consumer arrived.';
    const r = runOn(indexOpen([OPEN_ENTRY], 1) + closedSection([bare], 2));
    expect(r.code).toBe(1);
    expect(r.out).toContain('a closed entry is struck through and does not say what closed it');
  });

  it('prints the split the record\u2019s own bullets give, and all three parts are non-zero', () => {
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(shipped.status, `${shipped.stdout}${shipped.stderr}`).toBe(0);
    const line = shipped.stdout.split('\n').find((one) => one.includes('of docs/progress/closed'));
    expect(line, `the guard printed no line for the record: ${shipped.stdout}`).toBeDefined();
    const derived = authorityTally();
    // Non-vacuity on all three: a corpus with no round-closed entry or no denial would let the
    // split be printed correctly while saying nothing, and the round that found this one is the
    // only reason to believe three authorities is not one authority written three ways.
    expect(derived.finding, 'the record cites no finding, so the split is not a reading').toBeGreaterThan(0);
    expect(derived.round, 'the record names no round, so the second authority is untested here').toBeGreaterThan(0);
    expect(derived.none, 'the record holds no denial, so the third authority is untested here').toBeGreaterThan(0);
    expect(line).toContain(
      `${String(derived.finding)} by a finding, ${String(derived.round)} by a round, ${String(derived.none)} without one`,
    );
    expect(countIn(line ?? '', 'closed in the'), 'the total is not the three the line names').toBe(
      derived.finding + derived.round + derived.none,
    );
  });
});

/**
 * The record's heading gained a suffix, and the reader kept matching the old string.
 *
 * v3.45 wrote a round's record as a table for the first time --
 *
 * ```
 * ### Left open, in the order the goal is reached
 * | priority | item | state | next step |
 * ```
 *
 * -- and `sections()` matched the heading with `wanted.has(trimmed)`, so from that round on
 * **nineteen** records in volumes 10, 11 and 12 had no reader at all. Nothing was miscounted,
 * because a table has no entries: what was missing was the sentence saying the rows were not
 * judged, and a refusal for any third spelling. That is finding 162's shape, one level down --
 * the guard was fixed to read every section with that heading, and then the heading changed.
 *
 * The three fixtures below are the three ways it can go wrong now: rows that are read as
 * entries (refused), a table-form heading over prose (refused), and a spelling nobody declared
 * (refused). The first fixture is the shape the shipped log uses, so the arm is not a rule that
 * only ever fires.
 */
describe('docs · a record written as a table is read as rows, and a third spelling is refused', () => {
  const suffix = (body: string) => `### Left open, in the order the goal is reached\n\n${body}\n`;
  // The record after the live list's own section, not inside it: a `###` heading under `## Open`
  // is the nested-list refusal, which is a different rule and has its own test.
  const page = (record: string) =>
    `## Headline\n\ntext\n\n## Open\n\n${withId(OPEN_ENTRY, 1)}\n\n## Pass log\n\nbody\n\n${record}`;

  it('counts a suffix-form record whose body is a table, and says its rows were not judged', () => {
    // Four columns, because that is the shape the nineteen shipped records use and the guard
    // now checks the names (finding 465). The count is `1`, not `3`: v3.63 shipped this fixture
    // with `3` because the guard reported every pipe line -- header and rule included -- and a
    // test written against an output inherits the output's mistake (finding 464).
    const r = runOn(page(suffix('| priority | item | state | next step |\n| --- | --- | --- | --- |\n| **P1** | a residual | unchanged | nothing |')));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 of 1 record(s) are in table form (1 row(s)); the newest round wrote none, so no row was judged');
  });

  it('refuses an entry sitting under a record that is written as a table', () => {
    // The entry would be read by nothing: the heading says rows, so the bullet has no judge.
    const r = runOn(page(suffix(`${TABLE_HEAD}\n| **P1** | a residual | unchanged | nothing |\n\n- An entry the heading does not describe.`)));
    expect(r.code).toBe(1);
    expect(r.out).toContain('is written in table form and carries 1 entr(ies)');
  });

  it('refuses a suffix-form record that holds no table, rather than counting zero rows as a record', () => {
    const r = runOn(page(suffix('Prose, and no table at all.')));
    expect(r.code).toBe(1);
    expect(r.out).toContain('is written in table form and holds no');
  });

  it('refuses a third spelling of either name, so a list cannot leave its reader quietly', () => {
    const r = runOn(
      `## Headline\n\ntext\n\n## Open\n\n${withId(OPEN_ENTRY, 1)}\n\n### Left open (unfinished)\n\n` +
        `${OPEN_ENTRY.replace('- A residual.', '- Another.')}\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('begins with one of the list names this guard');
    expect(r.out).toContain('would have no reader');
  });
});

/**
 * The names the corpus gave the record, and the refusal that was written for the third one.
 *
 * v3.63 found that the record gained a suffix at v3.45 and nineteen tables left the guard's
 * reach, and answered with two spellings and a refusal:
 *
 * ```
 * const NEARLY = /^#{2,3} (?:Open|Left open|Closed)\b/;
 * ```
 *
 * The refusal is keyed to the names that existed, so it catches a third spelling that shares a
 * prefix with one of them -- `### Left open (unfinished)`, which the test above drives -- and
 * says nothing about a third spelling that shares none. The corpus then wrote two: `###
 * Leftovers, in the order that reaches the goal` (17 rounds) and `### What is left, in the order
 * it has to happen` (5). Twenty-two records were read by nothing at all, and the summary said
 * `25 record(s) in table form (188 row(s))` where the corpus held 47 and 318 (finding 579).
 *
 * What makes those two records is not the name. It is a table whose first column is `priority`:
 * 47 of the progress corpus's 555 tables begin with that column, and every one of them is a
 * round's record. So the refusal moves onto the thing the name was standing in for -- the body
 * -- and the names join the table.
 */
describe('docs · a record is found by its body, and every name the corpus gave it is read', () => {
  const page = (record: string) =>
    `## Headline\n\ntext\n\n## Open\n\n${withId(OPEN_ENTRY, 1)}\n\n## Pass log\n\nbody\n\n${record}`;
  const ROW = '| **P1** | a residual | unchanged | nothing |';

  it('reads a record under the name the corpus gave it', () => {
    const r = runOn(page(`### Leftovers, in the order that reaches the goal\n\n${TABLE_HEAD}\n${ROW}\n`));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 of 1 record(s) are in table form (1 row(s))');
  });

  it('reads a record whose fourth column is spelled `next`', () => {
    // Five of the 22 records name the column `next`; the other 42 name it `next step`. The
    // vocabulary is two words rather than one, and the refusal that compares a header with it
    // says both (finding 580).
    const r = runOn(
      page(
        '### What is left, in the order it has to happen\n\n' +
          `| priority | item | state | next |\n| --- | --- | --- | --- |\n${ROW}\n`,
      ),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 of 1 record(s) are in table form (1 row(s))');
  });

  it("refuses a record's table under a heading the guard does not read", () => {
    // The heading is invented and the body is not. This is what the prefix rule was reaching
    // for: a rule that fires on the shape costs the next rename a red gate instead of
    // twenty-two records nobody reads.
    const r = runOn(page(`### The leftovers of round 12\n\n${TABLE_HEAD}\n${ROW}\n`));
    expect(r.code).toBe(1);
    expect(r.out).toContain('`### The leftovers of round 12`');
    expect(r.out).toContain('first column is `priority`');
  });

  it('does not refuse a table that is not a record', () => {
    // The ledger every round writes: two columns, and the first is not `priority`. A rule keyed
    // on "a table under a heading this guard does not read" would refuse it, and it is a table.
    const r = runOn(page('### Readings\n\n| item | value |\n| --- | --- |\n| entries | 1 |\n'));
    expect(r.code, r.out).toBe(0);
  });

  it('counts a cell holding an escaped pipe as one cell', () => {
    // GFM requires a literal pipe in a cell to be written `\|`, including inside a code span.
    // The reader split on every pipe, so the only remedy its own diagnostic allows was read as
    // a fifth cell (finding 581).
    const r = runOn(
      page(
        '### Leftovers, in the order that reaches the goal\n\n' +
          `${TABLE_HEAD}\n| **P1** | a residual | unchanged | a \`run: \\|\` block |\n`,
      ),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 of 1 record(s) are in table form (1 row(s))');
  });

  it('refuses the unescaped pipe, which is the shape the corpus shipped once', () => {
    const r = runOn(
      page(
        '### Leftovers, in the order that reaches the goal\n\n' +
          `${TABLE_HEAD}\n| **P1** | a residual | unchanged | a \`run: |\` block |\n`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('has 5 cell(s) under a header that names 4');
  });

  it('reads the item from the column its header names, not from the second one', () => {
    // The shape check asks whether the header *names* the four columns, and the row arm then
    // took the item by **position**. A table that named its columns in another order passed the
    // check and had its item read out of whatever sat second -- none of the 47 does today, which
    // is what makes this a floor rather than a repair (finding 580).
    const r = runOn(
      '## v9.9 — a round\n\n### Left open, in the order the goal is reached\n\n' +
        '| item | priority | state | next step |\n| --- | --- | --- | --- |\n' +
        '| A residual the live list also carries | **P1** | unchanged | nothing |\n\n' +
        `## Open\n\n${withId('- A residual the live list also carries. [open: the reason this is still work is long enough]', 1)}\n\n` +
        'Checked at v9.9: **1** entries open\n\n## Pass log\n\nbody\n',
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("the v9.9 record's 1 row(s) were judged");
  });

  it('says how many records have no round, and how many rounds wrote none', () => {
    // O-081 asked for this number rather than for a refusal: a record in the `## Pass N` volumes
    // names no round and can never be merged into one. The second number is the other half, and
    // it is what makes the arm's own sentence -- a round has one record -- a statement about
    // rounds rather than about the records the arm could see (finding 579).
    const r = runOn(
      '## v9.8 — a round\n\n### Left open\n\n' +
        '- A residual. [open: the reason this is still work is long enough to read]\n\n' +
        '## v9.9 — a round\n\n### Readings\n\n| item | value |\n| --- | --- |\n| entries | 1 |\n\n' +
        `## Open\n\n${withId(OPEN_ENTRY, 1)}\n\nChecked at v9.9: **1** entries open\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 record(s): 1 under a round and 0 under none; 2 `vX.YY` round(s) + 0 addendum(s), 1 of them wrote none');
  });

  it('counts a record whose file names no round, rather than losing it', () => {
    // The `## Pass N` era: twenty-five records in three volumes that carry no `## vX.Y` heading at
    // all. The arm cannot judge them -- it looks up for an owner and finds none -- and the count
    // is the repair, because a population nobody printed is a population nobody can check.
    const r = runOn(
      `${indexOpen([OPEN_ENTRY])}\n### Left open\n\n` +
        '- A residual the file never dated. [open: the reason this is still work is long enough to read]\n',
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(
      '1 record(s): 0 under a round and 1 under none; 0 `vX.YY` round(s) + 0 addendum(s), 0 of them wrote none',
    );
  });
});

/**
 * A round is a number, and an addendum is a section of one.
 *
 * The population line said `211 round(s), 18 of them wrote none`, and both numbers were wrong in
 * the same way: `211` counted **headings** while `18` was a heading count minus a count of
 * distinct round names. The corpus repeats one number -- `## v2.15, addendum` -- so the difference
 * counted the repetition as a round that wrote nothing. There are **210** rounds, **17** of them
 * wrote no record, and one addendum.
 *
 * The count is derivable without a single heading: the numbers are dense inside each era, 94 of
 * them in `v2` (v2.06..v2.99) and 116 in `v3` (v3.00..v3.115), which is 210 slots with none empty.
 * That is why the two rules below refuse a number headed twice and a number no round uses: in a
 * corpus where every increment is a round, a gap is a round the log lost, and the two together are
 * the second derivation of a count this project only trusts twice.
 */
describe('docs · a round is a number, and the number line is dense', () => {
  const ITEM = 'A residual the live list also carries.';
  // Every open entry needs its own reason: the guard refuses two entries that share one, because a
  // shared reason is a placeholder that will be re-signed without being read.
  const reason = (n: number) => `reason ${String(n)}: this is still work and the reason is long enough`;
  const record = (n: number) => `### Left open\n\n- ${ITEM} [open: ${reason(n)}]\n\n`;
  const page = (stamp: string, rounds: string) =>
    `## Headline\n\ntext\n\n## Open\n\n${withId(`- ${ITEM} [open: ${reason(90)}]`, 1)}\n\n` +
    `Checked at ${stamp}: **1** entries open\n\n## Pass log\n\nbody\n\n${rounds}`;

  it('counts a round once, and prints the addendum beside the count', () => {
    // v9.9's addendum repeats its number by design, so a count of headings is 3 while the corpus
    // has 2 rounds. The line says both numbers, because a reader who was told `211 rounds` by every
    // earlier round deserves to see where that number came from (finding 585).
    const r = runOn(
      page(
        'v9.9',
        `## v9.8 — a round\n\n${record(1)}` +
          `## v9.9 — a round\n\n${record(2)}` +
          '## v9.9, addendum — the gate I ran could not fail\n\n### Readings\n\n| item | value |\n| --- | --- |\n| x | 1 |\n\n',
      ),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('2 `vX.YY` round(s) + 1 addendum(s), 0 of them wrote none');
  });

  it('refuses a round number headed twice', () => {
    // Two plain headings under one number is one number naming two rounds, and every question this
    // file asks -- which record did the round write, is the stamp current -- becomes a question
    // about position. The addendum form is the escape, and the refusal names it.
    const r = runOn(page('v9.9', `## v9.9 — a\n\n${record(1)}## v9.9 — b\n\nbody\n\n`));
    expect(r.code).toBe(1);
    expect(r.out).toContain('the round v9.9 is headed twice');
    expect(r.out).toContain('an addendum is `## v9.9, addendum`');
  });

  it('counts a round that wrote nothing once, even when its number is headed twice', () => {
    // The number this round repaired. The line used to be `rounds.length - recordRounds.size`: a
    // count of **headings** minus a count of distinct **names**. A repeated number therefore
    // reported a round that wrote nothing, in a corpus where the repetition was the only thing
    // wrong. The refusal and the count are two readers of one fact, and both have to say it.
    const r = runOn(
      page('v9.9', `## v9.9 — a\n\n${record(1)}## v9.9 — b\n\n${record(2)}`),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 `vX.YY` round(s) + 0 addendum(s), 0 of them wrote none');
  });

  it('refuses a gap in the round numbers', () => {
    // Two rounds whose numbers are two apart: one number names no round, so either a round is
    // missing from the log or a round was renumbered. Both are things a reader has to be told.
    const r = runOn(page('v9.10', `## v9.8 — a\n\n${record(1)}## v9.10 — b\n\n${record(2)}`));
    expect(r.code).toBe(1);
    expect(r.out).toContain('the round numbers go from v9.8 to v9.10, so 1 number(s) in between name no round');
  });

  it('reads the era boundary as the next round rather than as a gap', () => {
    // `v9.99` is followed by `v10.00` and not by `v9.100`: an era begins at `.00`. The shipped
    // corpus has exactly one of these, `v2.99 -> v3.00`, and a rule that read it as a 900-number
    // gap would refuse the corpus it was written for.
    const r = runOn(page('v10.00', `## v9.99 — a\n\n${record(1)}## v10.00 — b\n\n${record(2)}`));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('2 `vX.YY` round(s) + 0 addendum(s), 0 of them wrote none');
  });

  it('refuses an era that does not begin at its first round', () => {
    const r = runOn(page('v10.01', `## v9.99 — a\n\n${record(1)}## v10.01 — b\n\n${record(2)}`));
    expect(r.code).toBe(1);
    expect(r.out).toContain('neither continues the last one nor begins at `.00`');
  });

  it("reads an addendum's record as the round's, and not as a second round's", () => {
    // The shipped shape: `v2.15` wrote `### Left open`, then its addendum wrote `### Not fixed
    // here`. Keyed by number, the one-record rule would refuse the form the corpus invented for a
    // round that ran twice; keyed by heading, both records find their round and neither is a round
    // of its own (findings 575, 585).
    const r = runOn(
      page(
        'v9.9',
        `## v9.9 — a round\n\n${record(1)}` +
          '## v9.9, addendum — the gate I ran could not fail\n\n### Not fixed here\n\n' +
          `- **A promise the addendum made.** \`[open: ${reason(2)}]\`\n\n`,
      ),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(
      '2 record(s): 2 under a round and 0 under none; 1 `vX.YY` round(s) + 1 addendum(s), 0 of them wrote none',
    );
  });
});

/**
 * The fifth name is a list, and the body rule of v3.115 was written for a table.
 *
 * `### Not fixed here` is `v2.15`'s addendum: two entries, each a headline with a reason. It is a
 * record to any reader and it was prose to this guard -- and because it sits under an addendum, the
 * round it belongs to was counted among the rounds that wrote nothing, while it wrote two
 * promises. The body rule added in v3.115 asks whether a section's first cell is `priority` and
 * therefore only ever sees tables, which is one half of the shape space; this is the other half.
 *
 * The repair is not a sixth name -- finding 579 measured what a name table costs. It is the
 * property a name cannot lie about: the section holds **nothing but** top-level bullets and their
 * continuation lines, and at least one of them is an open entry, read with the same strike test the
 * live list uses. A plan is a list of bullets too, and what separates it from a record is that its
 * bullets carry no reason a reader could act on.
 */
describe('docs · a section that is only entries is a record, whatever its heading says', () => {
  const reason = (n: number) => `reason ${String(n)}: this is still work and the reason is long enough`;
  const page = (round: string) =>
    `## Headline\n\ntext\n\n## Open\n\n${withId(OPEN_ENTRY, 1)}\n\nChecked at v9.9: **1** entries open\n\n` +
    `## Pass log\n\nbody\n\n${round}`;

  it('counts it as a record, and reads the entries it holds', () => {
    // The two promises are in the live list as well, because the arm judges the newest round's
    // record against the entries and a record that names a residual nothing carries is refused --
    // which is the reader this section lacked until now.
    const r = runOn(
      `## Headline\n\ntext\n\n## Open\n\n` +
        `${withId(`- A promise. [open: ${reason(1)}]`, 1)}\n${withId(`- A second promise. [open: ${reason(2)}]`, 2)}\n\n` +
        'Checked at v9.9: **2** entries open\n\n## Pass log\n\nbody\n\n' +
        '## v9.9 — a round\n\n### Not fixed here\n\n' +
        `- A promise. [open: ${reason(1)}]\n- A second promise. [open: ${reason(2)}]\n`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 record(s): 1 under a round and 0 under none');
    // Non-vacuity: the section is not merely counted, its entries are judged. A count with no
    // reader is what this file exists to refuse, one level up from an entry with no reader.
    expect(r.out).toContain('2 open in the live list; 2 open restated in the log\'s records');
    expect(r.out).toContain("the v9.9 record's 2 row(s) were judged");
  });

  it('refuses a short reason inside it, which is only reachable if its entries are read', () => {
    const r = runOn(page('## v9.9 — a round\n\n### Not fixed here\n\n- **A promise.** `[open: too short]`\n'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('the open reason is 9 character(s)');
  });

  it('does not count a section that mixes prose with entries', () => {
    // The list a round writes in its own words: a sentence at column zero, then bullets. It is a
    // round's prose, not its record, and the property that separates them is the prose.
    const r = runOn(
      page(
        '## v9.9 — a round\n\n### What I did not fix\n\nThe list below is what this round left.\n\n' +
          `- **A promise.** \`[open: ${reason(1)}]\`\n`,
      ),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('0 record(s): 0 under a round and 0 under none');
  });

  it('does not count a list whose entries are all struck', () => {
    // A list of closures is not a record: the corpus keeps closures in one place, `## Closed`, and
    // a stricken headline is its own definition of one (finding 458).
    const r = runOn(
      page(
        '## v9.9 — a round\n\n### What this round closed\n\n' +
          `- ~~**A promise.**~~ ~~\`[open: ${reason(1)}]\`~~\n`,
      ),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('0 record(s): 0 under a round and 0 under none');
  });

  it('reads the shipped corpus as 234 records, with the addendum counted in', () => {
    // The shipped reading, and the rounds it carries: v3.115 found 22 records under two names the
    // guard did not read (218 -> its own), v3.116 found the addendum's record under a name and a form
    // it did not read (219), and every round since has added one -- v3.130's is the 234th. The rounds
    // are **225** and the addendum is one: the line used to print `211 round(s)` and `18 of them wrote
    // none` while subtracting a count of names from a count of headings (finding 585), and since
    // v3.121 it says which era its number counts, because the gate next door was printing a count of
    // headings under the same word (finding 600).
    //
    // The sentence is pinned here rather than derived because it is the one line a round can move
    // without touching the guard: a record added to a volume is a record this number counts, and a
    // number that moved silently is the defect finding 588 is about. The cost is one edit per round,
    // paid where the round is written.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(shipped.status, shipped.stdout + shipped.stderr).toBe(0);
    expect(shipped.stdout).toContain(
      '234 record(s): 209 under a round and 25 under none; 225 `vX.YY` round(s) + 1 addendum(s), 17 of them wrote none',
    );
    // One corpus, two readers, one number. `check-progress-volumes` counts these same rounds to
    // print the population beside its heading count, and the agreement between the two is the only
    // reason the 215 can be reconciled with the 268 (finding 600). Derived rather than pinned: a
    // second literal would let one reader move while the other stayed green, which is exactly the
    // shape the defect had -- two sentences, each true of its own subject, and nothing comparing them.
    const { order } = readVolumes();
    expect(shipped.stdout).toContain(`${String(populationsOf(order).version)} \`vX.YY\` round(s)`);
  });
});

/**
 * The rows the guard said it did not judge, and how many of them there were.
 *
 * v3.63 gave the table-form record a reader and a sentence: `19 record(s) in table form
 * (185 row(s)) whose rows were not judged`. The number is wrong, and it is wrong in the
 * direction that matters -- the nineteen records hold **147** rows, and 185 is what you get
 * by counting every line that begins with a pipe:
 *
 * ```
 * const rows = section.lines.filter((line) => /^\s*\|/.test(line)).length;
 * ```
 *
 * A markdown table carries two lines that are not rows: the header, which names the columns,
 * and the rule, which draws the line under it. Two lines per record, nineteen records, thirty-
 * eight rows that do not exist. The sentence the round added to be honest about what it had
 * not read overstated what it had not read by a third.
 *
 * The second half of the same line is worse than the arithmetic. That count is also the test
 * for "holds no table":
 *
 * ```
 * if (rows === 0) { problems.push('... holds no table ...'); return; }
 * ```
 *
 * A header and a rule are two pipe-lines, so a record that names its columns and stops passes
 * the refusal that was written for exactly that record, and the summary reports `2 row(s)`
 * for a table with no rows at all. The refusal was reachable on the day it was written; it is
 * a `=== 0` against a number that cannot be 1.
 *
 * And the test that shipped beside it asserted `3 row(s)` for a one-row table, because a test
 * written to match an output inherits the output's mistake -- which is why the fixtures below
 * count from the record rather than from the pipe.
 */
describe('docs · the rows a table-form record holds, counted from the record', () => {
  const suffix = (body: string) => `### Left open, in the order the goal is reached\n\n${body}\n`;
  const page = (record: string) =>
    `## Headline\n\ntext\n\n## Open\n\n${withId(OPEN_ENTRY, 1)}\n\n## Pass log\n\nbody\n\n${record}`;
  const HEAD = TABLE_HEAD;
  const row = (n: number) => `| **P${String(n % 9)}** | residual ${String(n)} | unchanged | nothing |`;

  it('counts a one-row record as one row, not as three lines', () => {
    // The shipped shape, and the number is read off the record: one row. While the count was
    // `filter(/^\s*\|/)`, this reported 3 -- and so did the test that shipped with it.
    const r = runOn(page(suffix(`${HEAD}\n| **P1** | a residual | unchanged | nothing |`)));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 of 1 record(s) are in table form (1 row(s)); the newest round wrote none, so no row was judged');
  });

  it('counts five rows in a five-row record, so the number is the record and not the file', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i + 1)).join('\n');
    const r = runOn(page(suffix(`${HEAD}\n${rows}`)));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('(5 row(s))');
  });

  it('refuses a record whose header is the whole table', () => {
    // The fixture is the hole: a header and a rule are two pipe-lines, so `rows === 0` was
    // never true for a table anyone would write. The record names its columns, holds nothing,
    // and was reported as `2 row(s)`.
    const r = runOn(page(suffix(HEAD)));
    expect(r.code).toBe(1);
    expect(r.out).toContain('holds a header and no row');
  });

  it('refuses a record that renames one of the four columns', () => {
    // `state` renamed to `note` is a record whose residuals still have a state, in a column a
    // reader grepping for the state cannot find -- and the count of rows nobody judged goes up
    // by nothing. That is finding 463's argument applied to a column instead of a heading.
    const renamed = '| priority | item | note | next step |\n| --- | --- | --- | --- |\n| **P2** | residual | unchanged | nothing |';
    const r = runOn(page(suffix(renamed)));
    expect(r.code).toBe(1);
    // Quoted, because the diagnostic names the column as a word a reader greps for -- and since
    // v3.115 it names every spelling the column may carry, so `next step` reads as `next step` or
    // `next` rather than as one of the two (finding 580).
    expect(r.out).toContain('and not `state`');
  });

  it('refuses a header with a row directly under it, because the rule is what separates them', () => {
    // Without the rule the first row is indistinguishable from a second header line, so a
    // reader splitting the block has no way to say which line names the columns.
    const noRule = '| priority | item | state | next step |\n| **P2** | residual | unchanged | nothing |';
    const r = runOn(page(suffix(noRule)));
    expect(r.code).toBe(1);
    expect(r.out).toContain('draws no rule under them');
  });

  it('refuses a row whose cells do not match its header', () => {
    // A reader who splits on the pipe shifts a column, and the shifted cell is the *state* --
    // the one column this guard says it does not judge. Refusing the shape is what makes that
    // sentence honest: the guard cannot read the state, and it can at least say which column
    // it is in.
    const r = runOn(page(suffix(`${HEAD}\n| **P2** | residual | unchanged |`)));
    expect(r.code).toBe(1);
    expect(r.out).toContain('has 3 cell(s) under a header that names 4');
  });

  it('refuses a row whose state cell is empty, and only for the emptiness', () => {
    // The one mechanical thing about a column of prose. 147 shipped rows, not one empty cell, so
    // this is a floor rather than a repair -- and it is the only judgement the guard makes on a
    // cell it says it does not judge: a locatable column is not a judged value.
    const blank = `${TABLE_HEAD}\n| **P2** | residual |  | nothing |`;
    const r = runOn(page(suffix(blank)));
    expect(r.code).toBe(1);
    expect(r.out).toContain('`state` cell is empty');
  });

  it('reads the shipped corpus as 318 rows, and the bold-cell count is 130 short of them', () => {
    // The third opinion, and the one that had to be repaired.
    //
    // 147 was derived here from the *content* of the rows -- "a record's first cell is a bold
    // priority" -- and compared with what the guard arrived at from the structure. The premise
    // was true of the 25 records the guard could read and false of the 22 it could not: those
    // name a plain priority, which is the convention v3.81's own prose explains, so a census
    // keyed on the bold cell agreed with a population that was 22 records short (finding 582).
    //
    // The derivation is the structure now: the rows under a table whose first column is
    // `priority`, counted from the file, which is the property the guard refuses on. The bold
    // count is still taken, and held *below* it -- the 130 rows of the records no bold-cell
    // census can see are the number this round found.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(shipped.status, shipped.stdout + shipped.stderr).toBe(0);
    const bold = progressCorpus()
      .flatMap((file) => file.text.split('\n'))
      .filter((line) => /^\|\s*\*\*P\d+/.test(line.trim())).length;
    const structural = progressCorpus().reduce((n, file) => n + priorityTables(file.text).rows, 0);
    expect(bold, 'the corpus holds no bold priority rows, so the comparison is vacuous').toBeGreaterThan(100);
    expect(structural, 'the bold-cell census caught up with the structure, so the gap is gone').toBeGreaterThan(bold);
    expect(shipped.stdout).toContain(`(${String(structural)} row(s))`);
    expect(shipped.stdout).not.toContain(`(${String(bold)} row(s))`);
    expect(shipped.stdout).not.toContain('(185 row(s))');
  });
});

/**
 * The residual that lives in a record and nowhere else.
 *
 * A round's record has four columns and the `item` column is a sentence about a residual. Until
 * v3.65 nothing compared that sentence with the live list, and four residuals were in records and
 * in no entry at all -- the only **P1** in this log among them, six rounds old. A reader who greps
 * the list for what is open, which is the reader the list exists for, was not told about the
 * largest thing outstanding, and the currency stamp could not say so: its number is arithmetic over
 * the entries below it, and a residual that is not an entry is not counted.
 *
 * The arm reads the **newest** record only. Older records are frozen -- nothing appends to them --
 * so a rule that judged them would be a rule demanding a repair the corpus forbids. The newest one
 * is the one that can still be edited, which is the same scope, and the same reason, as the
 * currency stamp's round comparison.
 *
 * Two outcomes, and the second is the one that matters for a reader: a row that names nothing is
 * refused, and a row that is a **paraphrase** of an entry is refused too -- because then the row's
 * words exist in one place and the entry's words in another, and `grep` finds neither both ways.
 * That is finding 463's argument (a title is an exact string) applied to a cell.
 */
describe('docs · a record may not be the only place a residual lives', () => {
  const QUOTED = 'A residual the live list also carries';
  const LIVE = `- ${QUOTED}. [open: the reason this is still work, long enough to be a reason a reader acts on]`;
  const ROUND = 'v9.9';

  /** One round whose record is `body`, over a live list holding exactly one entry. */
  const page = (body: string) =>
    `## ${ROUND} — a round\n\n### Left open, in the order the goal is reached\n\n${TABLE_HEAD}\n${body}\n\n` +
    `## Open\n\n${withId(LIVE, 1)}\n\nChecked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`;

  it('accepts a row whose item quotes an entry the live list holds', () => {
    const r = runOn(page(`| **P1** | ${QUOTED} | unchanged | nothing |`));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`the ${ROUND} record's 1 row(s) were judged, and every one of them matches an entry on its first 20 characters`);
  });

  it('refuses a row that names a residual no entry in either file holds', () => {
    // The shipped defect in fixture form: this is v3.64's own first row, seven rounds after the
    // residual it names was raised, and the list it was raised against has never mentioned it.
    const r = runOn(page('| **P1** | the split is expensive by 240 s of every run | unchanged | nothing |'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('names a residual the list does not hold');
    expect(r.out).toContain('in no entry of `## Open` or `## Closed`');
    expect(r.out).toContain('have to appear in an entry, so add the entry or open the row with its words');
  });

  it('leaves an older record alone, because a frozen record cannot be repaired', () => {
    // The scope is the newest record, and the reason is in the corpus rather than in taste:
    // a record is frozen, nothing appends to it, and its rows are how the log was kept before
    // the rule existed. A rule over the older twenty would demand a repair the corpus forbids
    // -- so the newest record is judged and the one before it is history.
    const older = `## v9.8 — the round before\n\n### Left open, in the order the goal is reached\n\n${TABLE_HEAD}\n` +
      '| **P1** | a residual the list does not hold, written before the rule | unchanged | nothing |\n\n';
    const newer = `## ${ROUND} — a round\n\n### Left open, in the order the goal is reached\n\n${TABLE_HEAD}\n` +
      `| **P1** | ${QUOTED} | unchanged | nothing |\n\n`;
    const r = runOn(
      `${older}${newer}## Open\n\n${withId(LIVE, 1)}\n\nChecked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`the ${ROUND} record's 1 row(s) were judged, and every one of them matches an entry on its first 20 characters`);
  });

  it('judges the record the newest round wrote, whichever form it was written in', () => {
    // Finding 568's second half. The arm's subject is "the newest record", and the record's
    // *form* changed at v3.70 -- from a table to a list of entries -- so a selection by form
    // picked the newest table, which was v3.69, and judged a record that had been frozen for
    // forty-one rounds. It stayed green because those rows happened to quote entries the list
    // still carried; it went red the moment they moved out (finding 568).
    //
    // The fixture is the shape: an older table whose row names nothing, and a newer list whose
    // entry names the live residual. Judging the table would refuse this document, and the
    // document is the one the last forty rounds wrote.
    const older =
      `## v9.8 — the round before\n\n### Left open, in the order the goal is reached\n\n${TABLE_HEAD}\n` +
      '| **P1** | a residual the list has never held, written when this arm could not see it | unchanged | nothing |\n\n';
    const newer =
      `## ${ROUND} — a round\n\n### Left open\n\n` +
      `- ${QUOTED}. [open: the reason this is still work, long enough to be a reason a reader acts on]\n\n` +
      `## Open\n\n${withId(LIVE, 1)}\n\nChecked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`;
    const r = runOn(`${older}${newer}`);
    expect(r.code, r.out).toBe(0);
    // Zero table rows are judged -- the newest round wrote none -- and the entry that *was*
    // judged is the newest round's own, which is the sentence the summary has to say.
    expect(r.out).toContain(`the ${ROUND} record's 1 row(s) were judged, and every one of them matches an entry on its first 20 characters`);
  });

  it('refuses a row whose item is too short to name anything at all', () => {
    // `see above` is 9 characters and matches no entry, so it would be refused anyway -- but by
    // the wrong arm, and a sentence about a coincidence is not a sentence about a rule.
    const r = runOn(page('| **P1** | see above | unchanged | nothing |'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('too short to name an entry');
  });
});

/**
 * What the arm was comparing, once its subject became right (findings 573 and 574).
 *
 * ## The green that was a set of one member
 *
 * v3.113 fixed this arm's **selection**: it had been judging v3.69's table for forty-one rounds,
 * because it collected only the table form and the rounds stopped writing tables at v3.70. The fix
 * gave it the newest record in either form -- and the form every round since v3.70 writes is a
 * `### Left open` list of **entries**. The population it compared rows against was built by pushing
 * every entry the walk read, records included, so for that form the row and the entry it was
 * compared with were the same bullet:
 *
 * ```
 * witnesses.push(item)            // every entry, records included
 * records.push({ items: items.map((item) => item.split('\n')[0]... ) })  // the same bullets
 * population.some((one) => one.includes(row))                            // always true
 * ```
 *
 * The arm's one reading of a bullet-form record was v3.113's own, it reported two rows judged and
 * both quoting an entry, and one of the two quoted nothing but itself. That is the shape this file
 * exists to refuse -- a rule satisfied by construction -- and it was created by the round that fixed
 * the rule above it.
 *
 * ## The ruler that was published and never used
 *
 * Finding 468 published the comparison: twenty characters of the row, marks removed, inside an
 * entry. The code required the **whole** row, and nothing could tell, because a self-witnessing row
 * satisfies any ruler. Narrowing the population made the difference visible at once: the shipped
 * v3.113 record went red on a row that is right -- its first twenty characters are the live entry's
 * and its tail is the round's own account, which is the paraphrase finding 468 wrote the ruler for.
 *
 * ## One round, one record
 *
 * The arm's subject is "the newest round's record", and the selection takes the first one it finds.
 * A round that wrote two would have one judged and the other passed in silence -- finding 162's
 * shape (`a document that gains a list must gain a reader for it`) one kind over. No shipped round
 * does this; the refusal is a floor.
 */
describe('docs · a record is not a witness of itself, and the ruler is the one it published', () => {
  const ROUND = 'v9.9';
  const QUOTED = 'A residual the live list also carries';
  const LIVE = `- ${QUOTED}. [open: the reason this is still work, long enough to be a reason a reader acts on]`;
  /** The row's first twenty characters are the entry's, and its tail is the round's own words. */
  const SHARED = `${QUOTED}, and the record says the rest in its own words`;

  /** One round, whatever record it wrote, over a live list holding exactly one entry. */
  const page = (record: string) =>
    `## ${ROUND} — a round\n\n${record}\n\n## Open\n\n${withId(LIVE, 1)}\n\n` +
    `Checked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`;

  it('refuses a record whose own bullet is the only entry it quotes', () => {
    // 573, as a refusal. The bullet below is the record's row *and* the only text resembling it in
    // the corpus, so under the wide population it was its own witness and the arm stayed green.
    const r = runOn(
      page(
        "### Left open\n\n- a residual no entry of the list holds, written in the round's own words and nowhere else\n" +
          '  [open: the reason this is still work, long enough to be a reason a reader acts on]',
      ),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('names a residual the list does not hold');
    expect(r.out).toContain('appears in no entry of `## Open` or `## Closed`');
  });

  it('accepts a row that matches an entry on its first twenty characters and not on its tail', () => {
    // 574, as the green side. The row is a sentence about an entry rather than a copy of it, which
    // is what a record's row is: the round writes the list entry and then writes its own account of
    // it. The whole-row rule refused this shape, and the shipped v3.113 record has exactly it.
    const r = runOn(
      page(`### Left open, in the order the goal is reached\n\n${TABLE_HEAD}\n| **P1** | ${SHARED} | unchanged | nothing |`),
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('matches an entry on its first 20 characters');
  });

  it('refuses a round that wrote two records, because only the first of them is judged', () => {
    // 575. The second record's row names something no entry holds, and the arm never looks at it:
    // that silence is the defect, and the assertion below is about the silence rather than about
    // the row. A round has one record, so two is a document that has to be merged rather than read.
    const r = runOn(
      page(
        `### Left open\n\n- ${QUOTED}. [open: the reason this is still work, long enough to be a reason a reader acts on]\n\n` +
          '### Left open\n\n- a residual the second half of the round raised, which no entry anywhere holds\n' +
          '  [open: another reason, long enough to stand as a reason here]',
      ),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain(`the ${ROUND} round wrote 2 records`);
    expect(r.out).not.toContain('names a residual the list does not hold');
  });

  it('refuses a record written above its round, because a record is found by the heading above it', () => {
    // 577, the other half of the selection: 575 is a round with two records, this is a record with
    // no round. The arm looks *up* for its owner, so a record above the first heading in its file is
    // found by nothing -- it never reaches the arm, and its entries are still counted. The file is
    // asked rather than guessed: a volume that names no round at all is the era before rounds had
    // numbers, and only a file that names rounds can be told that the record was written too high.
    const r = runOn(
      `### Left open\n\n- ${QUOTED}. [open: the reason this is still work, long enough to be a reason a reader acts on]\n\n` +
        `## ${ROUND} — a round\n\n## Open\n\n${withId(LIVE, 1)}\n\n` +
        `Checked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("sits above this file's first round heading");
    expect(r.out).toContain('a record is found by the round above it, and this one is judged by nothing');
  });
});

/**
 * The split: what the live list is for, and the record that keeps it that way.
 *
 * Until v3.111 a closed entry was struck where it stood, so `## Open` carried its own history
 * and grew by it -- **65,544 of 98,927 bytes** by v3.110, two thirds of the list a reader opens
 * to find out what is still open. The index that holds it had grown past the size a volume can
 * be born at, and the rule that bounds it compares it with the volume that is still open, so
 * the size of a list of closures was the reason the log could not start another volume
 * (finding 568).
 *
 * The split is only a split if it holds, and it holds by two refusals: a strike in the live
 * list, and a bullet in the record that is not struck. Both are below, and so is the shipped
 * document, because a rule that only ever runs over fixtures is a rule nobody has seen work on
 * the thing it was written for.
 */
describe('docs · the live list holds work, the record holds closures, and neither drifts', () => {
  /** A document with one open entry, as the shallowest fixture that can carry a refusal. */
  const live = (entry: string) => `## Open\n\n${withId(entry, 1)}\n\n## Pass log\n\nbody\n`;

  it('refuses a struck entry in the live list, and names the file the closure belongs in', () => {
    // The refusal that keeps the split. Without it the closures drift back one strike at a
    // time, and the file that could not grow is the file that cannot grow again: the index's
    // bound is the open volume, and a volume is born at about 9 KB.
    const r = runOn(live(CLOSED_ENTRY));
    expect(r.code).toBe(1);
    expect(r.out).toContain('history is filed as work');
    expect(r.out).toContain('move it to `docs/progress/closed.md` and delete it here');
    // The refusal is not the stamp's: an entry that is closed is already excluded from the
    // count, so the number at the top of the list was right about this file while the file was
    // growing by the entry. That is why the rule has to refuse rather than count.
    expect(r.out).toContain('check-open-list: FAILED');
  });

  it('refuses an entry in the record that is not struck, because nobody reads the record for work', () => {
    // The mirror, and the worse direction: the only list a reader consults for what is left to
    // do is `## Open`, so an unstruck bullet here is work that will never be done and will never
    // be seen to be undone.
    const r = runOn(`## Closed\n\n${withId(OPEN_ENTRY, 1)}\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('work is filed as history');
    expect(r.out).toContain('no reader of the live list will see it');
  });

  it('refuses a `## Closed` heading that gained a suffix, rather than reading no list at all', () => {
    // Finding 463's shape, one name further on: a heading that gained a suffix left nineteen
    // records outside the guard's reach without a word, because the match was an exact string.
    const r = runOn(`## Closed, and how it emptied\n\n${CLOSED_ENTRY}\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('begins with one of the list names this guard');
  });

  it('lets a row name a residual the record holds, because the list is two files now', () => {
    // The regression the split caused, and the reason `DOCS` reads the record first. A round's
    // record may name a residual the round **closed** -- that is what closing it meant -- and
    // while closures were struck in place, the row resolved against the live list. Moving them
    // narrowed that population to what is still open, and the arm went red on rows that had been
    // right for forty rounds. The population is every entry the list holds, in either file.
    const body = '| **P1** | the closure the round recorded | unchanged | nothing |';
    const r = runOn(
      `## v9.9 — a round\n\n### Left open, in the order the goal is reached\n\n${TABLE_HEAD}\n${body}\n\n` +
        `## Open\n\n${withId(OPEN_ENTRY, 1)}\n\nChecked at v9.9: **1** entry open\n\n## Pass log\n\nbody\n\n` +
        `## Closed\n\n- ~~**O-002 · the closure the round recorded**~~ **Closed by finding 150**, which settled it.\n`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("the v9.9 record's 1 row(s) were judged, and every one of them matches an entry on its first 20 characters");
  });

  it('reads the shipped record and the live list as one corpus, and counts each from its own file', () => {
    // Non-vacuity for both refusals above: the shipped documents are judged by the same rules,
    // so a `## Open` that went back to carrying its history would fail here rather than after
    // the next volume boundary. The counts are arithmetic over the files -- a pinned forty-eight
    // would have to be re-signed by every closure, and a number re-signed on every unrelated
    // edit is a number nobody reads.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(`${shipped.stdout}${shipped.stderr}`).toContain('check-open-list: OK');
    expect(shipped.status).toBe(0);

    const record = shippedRecord();
    const closures = record.reduce(
      (sum, file) => sum + file.text.split('\n').filter((line) => line.startsWith('- ')).length,
      0,
    );
    expect(closures, 'the record holds no entry, so nothing below is a reading').toBeGreaterThan(0);
    const line = shipped.stdout
      .split('\n')
      .find((one) => one.includes('of docs/progress/closed'));
    expect(line, `the guard printed no line for the record: ${shipped.stdout}`).toBeDefined();
    expect(line).toContain(`${String(closures)} closed in the record of closures (`);
    expect(countIn(line, 'closed in the'), 'the total the line prints is not the bullets the record holds').toBe(closures);
    // And every file of the set is named in that one line: a summary that counted a file it did not
    // name would let a reader check the total against the wrong file.
    for (const file of record) expect(line).toContain(file.name);

    // And the live list's own number: every entry it holds is open, because a struck one is
    // refused above. A zero here is the split, stated where a reader of the gate's output sees
    // it rather than inferred from a green build.
    const index = shipped.stdout.split('\n').find((one) => one.includes('of docs/progress.md and its volumes:'));
    expect(index, `the guard printed no line for the live list: ${shipped.stdout}`).toBeDefined();
    // This assertion used to read `toContain('0 closed by a finding')`, and its comment said the
    // live list closes nothing. Both were wrong: the line is the index **and its volumes**, the
    // volumes' records close thirty, and the zero matched the last digit of that thirty (finding
    // 589). v3.122 found the other half of the same mistake: the *open* number was pooled too, so
    // the line published 597 over a list that held 37 (finding 602). What is true of this line is
    // its arithmetic, and now each part names the population it counts.
    const indexLine = index ?? '';
    const parts = [...indexLine.matchAll(/(\d+) open (?:in the live list|restated in the log's records)/g)].map((one) =>
      Number(one[1]),
    );
    expect(parts, 'the line does not name the live list and the records apart').toHaveLength(2);
    expect(countIn(indexLine, 'entry(ies)'), 'the parts do not add up to the whole').toBe(
      parts.reduce((sum, one) => sum + one, 0) + countIn(indexLine, 'closed in the'),
    );
  });

  it('names the record from the index, so a closure is one link away from the list that closed it', () => {
    // The pointer is what makes the record reachable: a reader who greps the live list for
    // something that was closed finds nothing, and the sentence above the list is the only
    // place that tells them where it went. Nothing else in the tree asserts this link.
    const index = readFileSync(resolve(ROOT, 'docs', 'progress.md'), 'utf8');
    expect(index).toContain('progress/closed.md');
  });
});

/**
 * An entry needed a name of its own, because the rule that keeps the two lists apart is a
 * rule about text.
 *
 * v3.111 moved forty-eight closures out of the live list and into a file, and the move was
 * checked **once, by hand**: seventy-six entries in, seventy-six out, twenty-eight plus
 * forty-eight. That is a measurement, and a measurement of the one edit is not a rule about
 * the next edit. Nothing in the tree held the pair together afterwards, and the pair has a
 * hole in it that both of the split's refusals walk past:
 *
 * - an entry copied into the record **struck**, and left in the live list **unstruck**, is a
 *   legal bullet on both sides -- history where history belongs, and work where work does. It
 *   is one residual counted twice, and a reader who acts on the live one is acting on a
 *   closure.
 *
 * The hole is not a shape anyone could close with more text rules, because the two copies are
 * textually different by construction: one is struck and the other is not. It closes with an
 * **identity** -- every entry of the two lists carries an id, the two lists share one id space,
 * and the space is dense. Then:
 *
 * - a copy is one id in two places, which is refused outright;
 * - a deletion is a hole in the space, which is refused as an entry that left without being
 *   closed;
 * - and "the next entry takes max + 1" stops being a convention to remember. It is the only
 *   number that leaves the space dense, so a round that invents another one is refused.
 *
 * ## What the id does not do
 *
 * It does not say the text is the same entry. A closure can arrive in the record carrying the
 * id of an entry whose words were rewritten, and no reading of two files can tell that from a
 * closure -- the entry it replaced is gone. Nor can it see a rename. What it makes impossible
 * is the **silent** version of either: the id is the thing a reader greps, and a grep that
 * finds it in `## Closed` says which sentence closed it.
 *
 * The token is three digits wide, so the space ends at 999, and the width is fixed rather than
 * padded to fit because `O-100` must not match the front of `O-1000` in a prefix grep. The
 * refusal is below, and it fires on the ids a rewrite of this guard is most likely to meet
 * first rather than on a list anybody will reach.
 */
/** The `- ` lines of one section of one file, because the index carries records as well. */
function sectionEntries(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  const rest = start === -1 ? [] : lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => /^- /.test(line));
}

describe('docs · every entry has an identity, so nothing can leave the two lists unrecorded', () => {
  const OTHER = '- Another residual. [open: another reason, long enough to be a reason a reader acts on]';

  it('refuses an entry that carries no id, and says where the token goes', () => {
    // The fixture is the state the shipped lists were in until v3.112: a perfectly good entry
    // that no rule can hold across a move, because nothing names it.
    const r = runOn(`## Open\n\n${OPEN_ENTRY}\n\n## Pass log\n\nbody\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('carries no id');
    expect(r.out).toContain('a move cannot be told from a deletion');
    expect(r.out).toContain('right after the bullet');
  });

  it('reads the two files as one id space, because a closure keeps the id it was opened with', () => {
    // The move, as a fixture: `O-002` is in the record and the live list holds the ids either
    // side of it. Nothing in either file is contiguous on its own, and the pair is dense --
    // which is what "one space, two files" means.
    const r = runOn(
      `## Open\n\n${withId(OPEN_ENTRY, 1)}\n${withId(OTHER, 3)}\n\n## Pass log\n\nbody\n\n${closedSection([CLOSED_ENTRY], 2)}`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('3 entr(ies) with ids 1..3 (2 in the live list, 1 in the record of closures), and none is missing');
  });

  it('refuses an id that names two entries, which is the copy both of the split refusals walk past', () => {
    // One residual in two places: struck in the record, unstruck in the live list. Each side
    // satisfies its own refusal, so until the ids arrived this document was green -- and a
    // reader of the live list would have done work that says `Closed by finding 150`.
    const r = runOn(indexOpen([OPEN_ENTRY]) + closedSection([CLOSED_ENTRY]));
    expect(r.code).toBe(1);
    expect(r.out).toContain('names two entries');
    expect(r.out).toContain('O-001');
    expect(r.out).toContain('a reused id hides a closure');
  });

  it('refuses a gap, because a gap is an entry that left without arriving in the record', () => {
    // The deletion the tiling equation could not see: `O-002` is simply gone from both files,
    // and the live list is one entry shorter with nothing to say why.
    const r = runOn(
      `## Open\n\n${withId(OPEN_ENTRY, 1)}\n${withId(OTHER, 3)}\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('the ids skip O-002');
    expect(r.out).toContain('an entry leaves these lists only by being closed');
  });

  it('refuses an id four digits wide, because a prefix grep for O-100 must not find O-1000', () => {
    const wide = '- **O-1000 · An item.** [open: a reason long enough to stand as one, and this is it]';
    const r = runOn(`## Open\n\n${wide}\n\n## Pass log\n\nbody\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('O-1000 is 4 digits wide');
    expect(r.out).toContain('the token is three');
    expect(r.out).toContain('a prefix grep for O-100 would find it');
  });

  it('refuses O-000, because the space starts at one and the summary line promises 1..N', () => {
    // The token that passes the width rule and is still not a number in the space. Without this
    // refusal a set holding `O-000` and `O-001` is "dense" as far as the gap check can tell -- every
    // number from 1 to the maximum is present -- and the summary prints `2 entr(ies) with ids 1..2`
    // over two ids that are 000 and 001. A published number that is false about its own subject.
    const zero = '- **O-000 · An item.** [open: a reason long enough to stand as one, and this is it]';
    const one = '- **O-001 · Another item.** [open: and a second reason, long enough to be a reason here]';
    const r = runOn(`## Open\n\n${zero}\n${one}\n\n## Pass log\n\nbody\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('O-000 is zero and the space starts at O-001');
    expect(r.out).not.toContain('with ids 1..2');
  });

  it('refuses an id narrower than three, and does not accuse it of the prefix defect', () => {
    // The other direction is a different defect, and the first version of this refusal said the
    // wrong one: `grep O-009` does not match `O-9`, so "a prefix grep would find it" sends a reader
    // looking for a collision that cannot exist. What a narrow id does is part the space's spelling
    // from its numbers -- `O-9` stands where `O-009` is missing, so the guard would report a hole
    // over the entry that fills it.
    const narrow = '- **O-9 · An item.** [open: a reason long enough to stand as one, and this is it]';
    const r = runOn(`## Open\n\n${narrow}\n\n## Pass log\n\nbody\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('O-9 is 1 digit(s) wide');
    expect(r.out).toContain('it is not O-009');
    expect(r.out).not.toContain('a prefix grep for O-009 would find it');
  });

  it('does not ask a round record for ids, because a record is frozen and moves nothing', () => {
    // The scope, held still. There are 559 entries in the shipped records; a rule that required
    // ids of them would demand a repair of every round ever written, and the guard's own
    // docstring says why a frozen corpus is not judged.
    const r = runOn(openSection('Pass 1', [OPEN_ENTRY, CLOSED_ENTRY]));
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain('carries no id');
  });

  it('reads the shipped lists as one dense space, which is the tiling as a guard and not a measurement', () => {
    // Non-vacuity, and the number is counted from the files rather than pinned: a pinned
    // seventy-nine would have to be re-signed by every closure, and the point of the id is that
    // the *next* one is arithmetic.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(shipped.status, `${shipped.stdout}${shipped.stderr}`).toBe(0);
    // The entries of the two sections, not the bullets of the two files: the index also
    // carries every round's `### Left open` record, and those entries have no ids by design.
    const liveCount = sectionEntries(readFileSync(resolve(ROOT, 'docs', 'progress.md'), 'utf8'), '## Open').length;
    const closedCount = shippedRecord().reduce((sum, file) => sum + sectionEntries(file.text, '## Closed').length, 0);
    const entries = liveCount + closedCount;
    expect(entries, 'the two lists hold no entry, so nothing below is a reading').toBeGreaterThan(50);
    // The space is one number and two lists, so the line names both: 93 ids over 37 open and 56
    // closed, and a reader can add them (finding 602). The count is derived from the files rather
    // than pinned, so the sentence moves with the corpus instead of being re-signed by every
    // closure.
    expect(shipped.stdout).toContain(
      `${String(entries)} entr(ies) with ids 1..${String(entries)} (${String(liveCount)} in the live list, ` +
        `${String(closedCount)} in the record of closures), and none is missing`,
    );
  });
});

/**
 * The record is a **set** of files, and a file nobody reads is the hole the ids cannot see.
 *
 * ## The accident this round is built on
 *
 * `docs/progress/closed.md` was one path in `DOCS`, and the id space of finding 570 is dense
 * *within the population it is given*. Put the last ten entries into `docs/progress/closed-02.md`
 * -- the file name a split would use -- and the guard read one file, reported
 * `69 entr(ies) with ids 1..69, and none is missing`, and exited 0. Ten closures had left the
 * corpus, and the one rule written for exactly that shape (an entry may not leave these lists)
 * could not fire, because the space it checks is computed from the files it happened to open.
 *
 * So the population has to be complete **before** the identity rule means anything, and the
 * population is a discovery problem: which files are the record, in which order, and what happens
 * to a name that is close to one of them.
 *
 * ## Why the rules are three and not one
 *
 * A set loses a member in three ways, and each has its own repair: a **gap** in the numbering (a
 * deleted file), a name that is **named like the record and is not one of its files** (a copy, or a
 * spelling from a different convention), and a **second first file** (`closed-01.md` beside
 * `closed.md`, two answers to where the record begins). The budget is the fourth rule and it is the
 * only one that is about the future: the file a round appends to is the last one, so the last one
 * is the only one judged.
 *
 * Each test below is one refusal, and each refusal is load-bearing -- the round's falsification log
 * removes each in turn and names what went red.
 */
describe('docs · the record is a set of files, and the set has to be complete before its ids mean anything', () => {
  /** The live list, as the corpus's first file: one open entry, and it holds id 1. */
  const indexOne = () => `## Open\n\n${withId(OPEN_ENTRY, 1)}\n\n## Pass log\n\nbody\n`;

  /** Two more live entries, for the fixture that needs the record to hold a gap in the middle. */
  const SECOND = '- Another residual. [open: another reason, long enough to be a reason a reader acts on]';
  const THIRD = '- A third residual. [open: a third reason, long enough to stand as a reason here]';

  /** One closure, in the shape the shipped record uses. */
  const closure = (n: number) => `- ~~An old item ${String(n)}.~~ **Closed by finding ${String(150 + n)}**: the consumer arrived.`;

  /** A record file: a heading and `count` closures, numbered from `from`. */
  const recordOf = (from: number, count = 1) =>
    `## Closed\n\n${Array.from({ length: count }, (_, i) => withId(closure(from + i), from + i)).join('\n')}\n`;

  it('reads every file of the record, which is the file a split would create', () => {
    // The accident, as a rule: two files, one space. The summary names both, because a total a
    // reader cannot attribute to a file is a total they cannot check.
    const r = runOnRecord({ 'closed.md': recordOf(2, 2), 'closed-02.md': recordOf(4, 2) }, indexOne());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('closed.md and ');
    expect(r.out).toContain(': 4 closed in the record of closures (4 by a finding, 0 by a round, 0 without one)');
    expect(r.out).toContain('5 entr(ies) with ids 1..5 (1 in the live list, 4 in the record of closures), and none is missing');
  });

  it('refuses a file named like the record that is not one of its files', () => {
    // `closed-copy.md` reads as a closure log to a person and as nothing to this guard. The repair
    // is a refusal rather than a glob: a glob would read it and catch the copy through the ids, and
    // would also read `closed-old.md`, `closed.md.bak` and every other name a person invents at
    // three in the morning -- as *the* record, at a position in the numbering that nothing chose.
    const r = runOnRecord({ 'closed.md': recordOf(2), 'closed-copy.md': recordOf(3) }, indexOne());
    expect(r.code).toBe(1);
    expect(r.out).toContain('named like the record and is not one of its files');
    expect(r.out).toContain('closed-copy.md');
  });

  it('refuses a gap in the numbering, because a deleted file is its entries', () => {
    // The id space is dense across the files it is given, so a missing *file* is invisible to it in
    // the same way a missing entry was before finding 570. The numbering is what makes the
    // difference visible, and the file that follows the gap is the one that says so.
    const r = runOnRecord({ 'closed.md': recordOf(2), 'closed-03.md': recordOf(3) }, indexOne());
    expect(r.code).toBe(1);
    expect(r.out).toContain('the record\'s files skip closed-02.md');
    expect(r.out).toContain('closed-03.md');
  });

  it('refuses a second first file, because the index links to one of them', () => {
    // `closed-01.md` is the number the first file would have if the numbering started at one, and
    // the first file is called `closed.md` because the index links there. Two of them would make
    // "where does the record begin" a question with two answers and one link.
    const r = runOnRecord({ 'closed.md': recordOf(2), 'closed-01.md': recordOf(3) }, indexOne());
    expect(r.code).toBe(1);
    expect(r.out).toContain('closed-01.md is a second answer to "where does the record begin"');
  });

  it('refuses a continuation that begins inside an entry', () => {
    // The volume rule's counterpart: a boundary drawn through a sentence. The preamble that tells a
    // reader what the numbers mean belongs to the first file, and a file that opens with prose is a
    // document cut in half -- the entries below it would still be counted, so nothing else notices.
    const r = runOnRecord(
      { 'closed.md': recordOf(2), 'closed-02.md': `## Closed\n\nthe rest of a sentence\n\n${withId(closure(3), 3)}\n` },
      indexOne(),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('which is not an entry');
    expect(r.out).toContain('the rest of a sentence');
  });

  it('refuses a continuation with no heading, because its entries are then in no list', () => {
    // The one with no diagnostic at all before this round: `sections()` finds nothing in a file
    // without the heading, so the walk went on and the corpus was quietly smaller. The defect is
    // not the missing heading, it is that the entries below it had no reader.
    const r = runOnRecord({ 'closed.md': recordOf(2), 'closed-02.md': `${withId(closure(3), 3)}\n` }, indexOne());
    expect(r.code).toBe(1);
    expect(r.out).toContain('carries no `## Closed` heading');
    expect(r.out).toContain('a set of closures nobody is told about');
  });

  it('refuses a record whose files are not in the order its numbers are', () => {
    // The property only a set of files can get wrong. The space is dense -- 1, 4, 2, 3 is the set
    // {1,2,3,4} -- so the identity rule is satisfied and the record's own order is reversed. A
    // closure keeps its number and slots in at its place, so the record *is* a run of numbers, and
    // the file boundary has to fall on that run.
    const r = runOnRecord({ 'closed.md': recordOf(4), 'closed-02.md': recordOf(2, 2) }, indexOne());
    expect(r.code).toBe(1);
    expect(r.out).toContain('comes after O-004');
    expect(r.out).toContain('filed in the wrong place');
  });

  it('reads the order as the record ordering and not as a corpus ordering', () => {
    // The scope, and it is one line of a rule away from being wrong. The live list holds 1, 4 and
    // 5 while the record holds 2 and 3: read in corpus order that is 1, 4, 5, 2, 3, which is not a
    // run of numbers and is right -- a closure keeps its number, so a residual closed from the
    // middle of the list carries a number the live list has long passed. A rule over the corpus
    // would refuse the first middle closure; the rule over the record refuses only a misplaced file.
    const r = runOnRecord(
      { 'closed.md': recordOf(2), 'closed-02.md': recordOf(3) },
      `## Open\n\n${withId(OPEN_ENTRY, 1)}\n${withId(SECOND, 4)}\n${withId(THIRD, 5)}\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('5 entr(ies) with ids 1..5 (3 in the live list, 2 in the record of closures), and none is missing');
  });

  it('refuses a last file over the budget, and names the file the closure needs', () => {
    // The budget is the only rule here about the future, and it is judged on the last file because
    // that is the only one a round may still edit. The diagnostic names the next file: the round
    // that crosses the line is the least free to think about what to call it.
    const r = runOnRecord(
      { 'closed.md': recordOf(2), 'closed-02.md': recordOf(3, 3) },
      indexOne(),
      { RCA_RECORD_BUDGET: '200' },
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('the next closure needs a file of its own');
    expect(r.out).toContain('closed-03.md');
  });

  it('does not judge a frozen file against the budget', () => {
    // The asymmetry, and it is the volume rule's. A budget is a limit on what a round may add; a
    // frozen record is not being added to, and a rule that refused it would be a rule that says a
    // document already written is illegal.
    const r = runOnRecord(
      { 'closed.md': recordOf(2, 4), 'closed-02.md': recordOf(6) },
      indexOne(),
      { RCA_RECORD_BUDGET: '300' },
    );
    expect(r.code, r.out).toBe(0);
  });

  it('refuses a budget that is not a number of bytes', () => {
    // `RCA_RECORD_BUDGET=twenty` would make every comparison false and the rule would never fire --
    // a limit that cannot be compared is the shape of every gate this repository has had to repair.
    const r = runOnRecord({ 'closed.md': recordOf(2) }, indexOne(), { RCA_RECORD_BUDGET: 'twenty' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('a budget has to be a positive number of bytes');
  });

  it('names the last file of the record, not the first, when the live list carries a closure', () => {
    // The refusal's advice has to be an address, and the address moved: a closure belongs in the
    // file a round may still edit. A message that said `closed.md` would send it to a frozen file,
    // where the next round's budget rule would refuse it for a reason two steps away.
    const r = runOnRecord(
      { 'closed.md': recordOf(2), 'closed-02.md': recordOf(3) },
      `## Open\n\n${withId(CLOSED_ENTRY, 1)}\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('history is filed as work');
    expect(r.out).toContain('move it to `');
    expect(r.out).toContain('closed-02.md` and delete it here');
  });

  it('resolves a row naming a residual the round closed against the closure in the second file', () => {
    // O-026, closed. The row arm's population became two files at v3.111 and a set of files at
    // v3.113, and the two switches had never been on together: every fixture that exercised the
    // cross-file population carried `## Open` and `## Closed` in the same document, which is not
    // the shipped shape. Here the round's record (in `--doc`) names a residual the round closed,
    // the closure is in `closed-02.md`, and neither the first file nor the live list mentions it --
    // so a green here is the second file being read by the arm that compares rows with the list.
    const CLOSED = 'the closure the round recorded in the second file, and what it settled';
    const r = runOnRecord(
      {
        'closed.md': `## Closed\n\n${withId('- ~~an old item~~ **Closed by finding 150**, which settled it.', 2)}\n`,
        'closed-02.md': `## Closed\n\n${withId(`- ~~${CLOSED}~~ **Closed by finding 151**, which settled it.`, 3)}\n`,
      },
      `## v9.9 — a round\n\n### Left open\n\n- ${CLOSED}. ` +
        '[open: a reason long enough to be a reason a reader acts on]\n\n' +
        `## Open\n\n${withId(OPEN_ENTRY, 1)}\n\nChecked at v9.9: **1** entry open\n\n## Pass log\n\nbody\n`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("the v9.9 record's 1 row(s) were judged");
    // The witness is the second file's closure and not the row: the row's number is O-003, and its
    // text appears nowhere the walk read except that file. A green with `closed.md` alone would be
    // this test passing for the reason it was written to rule out.
    expect(r.out).toContain('closed-02.md');
  });
});
