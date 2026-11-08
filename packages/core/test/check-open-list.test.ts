import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { progressCorpus } from '../../../scripts/docs-corpus.mjs';

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
 * One pass's `### Open` section, in the shape the shipped document uses.
 *
 * The reason is long enough to pass the length rule on purpose: a fixture that failed
 * for two reasons at once could not say which branch was reached.
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
 */
function indexOpen(entries: string[]): string {
  return `## Headline\n\ntext\n\n## Open\n\n${entries.join('\n')}\n\n## Pass log\n\nbody\n`;
}

const CLOSED_ENTRY = '- ~~An old item.~~ **Closed by finding 150**: the consumer arrived.';

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
      /check-open-list: OK \((\d+) entry\(ies\) across (\d+) section\(s\) of docs\/progress\.md(?: and its volumes)?: (\d+) open with a reason, (\d+) closed by a finding, and (\d+) record\(s\) in table form \((\d+) row\(s\)\)/,
    );
    expect(summary, `the guard's summary changed shape: ${shipped.stdout}`).not.toBeNull();
    const numbers = (summary ?? []).slice(1).map(Number);
    const entries = numbers[0] ?? 0;
    const sections = numbers[1] ?? 0;
    const open = numbers[2] ?? 0;
    const closed = numbers[3] ?? 0;
    // The corpus, not one path: the lists moved into the volumes with the rounds
    // they belong to (finding 197), and a test that counted headings in the index
    // alone would compare the guard's 47 against the index's 1.
    // Both spellings, and the union is the point: `## Open` is the index's live list
    // and `### Left open` is the list a round closes with, and the guard read one of them
    // until finding 203 -- 19,285 bytes of the other had no reader at all. A count
    // written as `=== '### Left open'` here would have agreed with the guard while both
    // ignored the same twelve entries.
    const headings = progressCorpus()
      .flatMap((file) => file.text.split('\n'))
      .filter((line) => {
        const trimmed = line.trim();
        // Three spellings, because the guard reads three: the live list, a record of entries,
        // and a record written as a table (`### Left open, in the order the goal is reached`),
        // which has had no reader since v3.45 -- finding 463. Counting only the first two here
        // would make this test agree with the guard while both ignored nineteen records.
        return trimmed === '## Open' || trimmed === '### Left open' || /^### Left open,/.test(trimmed);
      }).length;
    expect(sections, 'the guard read a different number of lists than the document has').toBe(headings);
    expect(entries, 'the parts do not add up to the whole').toBe(open + closed);
    expect(entries).toBeGreaterThanOrEqual(headings - (numbers[4] ?? 0));
    // Non-vacuity in the other direction: the shipped document has at least one
    // closure, so "closed by a finding" is a reading rather than a constant zero.
    expect(closed).toBeGreaterThan(0);
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
    expect(r.out).toMatch(/2 entry\(ies\) across 2 section\(s\)/);
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
    expect(clean.out).toMatch(/1 entry\(ies\) across 1 section\(s\)/);
  });

  it('refuses a closure that does not say what closed it', () => {
    // The rule the docstring promised and the regex did not enforce: `~~` alone passed,
    // so "~~something old~~" was a closure whose authority nobody could check. Eleven
    // of the twenty shipped closures could not have satisfied the strict version
    // either -- their citation wraps a line break -- which is why the pattern needs
    // `\s+` and why this fixture is one entry, not a document.
    const r = runOn(indexOpen(['- ~~An old item, struck through and otherwise silent.~~']));
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
      const r = runOn(indexOpen([entry]));
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
    const nested = `## Open\n\n${OPEN_ENTRY}\n\n### Left open\n\n${CLOSED_ENTRY}\n\n## Pass log\n\nbody\n`;
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
    `${ROUND}\n\nbody\n\n## Open\n\n${stamp === null ? '' : `${stamp}\n\n`}${entries.join('\n')}\n\n## Pass log\n\nbody\n`;

  it('passes when the stamp names the newest round and counts the entries below it', () => {
    const r = runOn(withStamp([OPEN_ENTRY, CLOSED_ENTRY], 'Checked at v3.62: **1** entry open.'));
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
    const r = runOn(indexOpen([quoted, CLOSED_ENTRY]));
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 open with a reason, 1 closed by a finding');
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

  it('accepts the same entry once its headline is struck too, which is the shape this log already used', () => {
    // Non-vacuity for the rule above: the only change is the headline's `~~`, so a guard that
    // refused the fixture for any other reason would fail here.
    const whole = HALF_STRUCK.replace(
      '- A residual whose caveat was settled a round later.',
      '- ~~A residual whose caveat was settled a round later.~~',
    );
    const r = runOn(indexOpen([whole, OPEN_ENTRY]));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open with a reason, 1 closed by a finding');
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
    const r = runOn(indexOpen([both]));
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
    const r = runOn(indexOpen([quoted, CLOSED_ENTRY]));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 open with a reason, 1 closed by a finding');
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
  const page = (record: string) => `## Headline\n\ntext\n\n## Open\n\n${OPEN_ENTRY}\n\n## Pass log\n\nbody\n\n${record}`;

  it('counts a suffix-form record whose body is a table, and says its rows were not judged', () => {
    // Four columns, because that is the shape the nineteen shipped records use and the guard
    // now checks the names (finding 465). The count is `1`, not `3`: v3.63 shipped this fixture
    // with `3` because the guard reported every pipe line -- header and rule included -- and a
    // test written against an output inherits the output's mistake (finding 464).
    const r = runOn(page(suffix('| priority | item | state | next step |\n| --- | --- | --- | --- |\n| **P1** | a residual | unchanged | nothing |')));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 record(s) in table form (1 row(s)) whose rows were not judged');
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
    const r = runOn(`## Headline\n\ntext\n\n## Open\n\n${OPEN_ENTRY}\n\n### Left open (unfinished)\n\n${OPEN_ENTRY.replace('- A residual.', '- Another.')}\n\n## Pass log\n\nbody\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('begins with one of the two names this guard');
    expect(r.out).toContain('would have no reader');
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
  const page = (record: string) => `## Headline\n\ntext\n\n## Open\n\n${OPEN_ENTRY}\n\n## Pass log\n\nbody\n\n${record}`;
  const HEAD = TABLE_HEAD;
  const row = (n: number) => `| **P${String(n % 9)}** | residual ${String(n)} | unchanged | nothing |`;

  it('counts a one-row record as one row, not as three lines', () => {
    // The shipped shape, and the number is read off the record: one row. While the count was
    // `filter(/^\s*\|/)`, this reported 3 -- and so did the test that shipped with it.
    const r = runOn(page(suffix(`${HEAD}\n| **P1** | a residual | unchanged | nothing |`)));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 record(s) in table form (1 row(s)) whose rows were not judged');
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
    expect(r.out).toContain('and not state');
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

  it('reads the shipped corpus as 147 rows, which is a number no pipe-line count produces', () => {
    // The third opinion. 147 is derived here from the *content* of the rows -- a record's first
    // cell is a bold priority -- and the guard must arrive at the same number from the
    // structure. 185, the number v3.63 printed, is 147 + 2 x 19.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(shipped.status, shipped.stdout + shipped.stderr).toBe(0);
    const rows = progressCorpus()
      .flatMap((file) => file.text.split('\n'))
      .filter((line) => /^\|\s*\*\*P\d+/.test(line.trim())).length;
    expect(rows, 'the corpus holds no priority rows, so this arm is vacuous').toBeGreaterThan(100);
    expect(shipped.stdout).toContain(`(${String(rows)} row(s))`);
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
    `## Open\n\n${LIVE}\n\nChecked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`;

  it('accepts a row whose item quotes an entry the live list holds', () => {
    const r = runOn(page(`| **P1** | ${QUOTED} | unchanged | nothing |`));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`the ${ROUND} record's 1 row(s), every one of which quotes an entry`);
  });

  it('refuses a row that names a residual no entry in the live list holds', () => {
    // The shipped defect in fixture form: this is v3.64's own first row, seven rounds after the
    // residual it names was raised, and the list it was raised against has never mentioned it.
    const r = runOn(page('| **P1** | the split is expensive by 240 s of every run | unchanged | nothing |'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('names a residual the live list does not hold');
    expect(r.out).toContain('add the entry, or quote the entry the row is about');
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
    const r = runOn(`${older}${newer}## Open\n\n${LIVE}\n\nChecked at ${ROUND}: **1** entries open\n\n## Pass log\n\nbody\n`);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`the ${ROUND} record's 1 row(s), every one of which quotes an entry`);
  });

  it('refuses a row whose item is too short to name anything at all', () => {
    // `see above` is 9 characters and matches no entry, so it would be refused anyway -- but by
    // the wrong arm, and a sentence about a coincidence is not a sentence about a rule.
    const r = runOn(page('| **P1** | see above | unchanged | nothing |'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('too short to name an entry');
  });
});
