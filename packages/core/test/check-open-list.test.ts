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
      /check-open-list: OK \((\d+) entry\(ies\) across (\d+) section\(s\) of docs\/progress\.md(?: and its volumes)?: (\d+) open with a reason, (\d+) closed by a finding\)/,
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
      .filter((line) => ['## Open', '### Left open'].includes(line.trim())).length;
    expect(sections, 'the guard read a different number of lists than the document has').toBe(headings);
    expect(entries, 'the parts do not add up to the whole').toBe(open + closed);
    expect(entries).toBeGreaterThanOrEqual(sections);
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
