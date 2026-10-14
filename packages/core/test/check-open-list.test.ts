import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

/**
 * The guard has no injection point for its document, and adding one to make it
 * testable would change the thing under test. So these tests drive the *predicates*
 * the script applies, by reading the shipped file and re-running its two regexes --
 * the same shapes the fixtures below are written in.
 */
const CLOSED = /~~|Closed by finding \d+/;
const OPEN = /\[open:\s*([^\]]*)\]/;

function judge(entries: string[]) {
  const problems: string[] = [];
  const reasons = new Map<string, string>();
  for (const item of entries) {
    if (CLOSED.test(item)) continue;
    const open = item.match(OPEN);
    if (!open) {
      problems.push('neither closed nor explained');
      continue;
    }
    const reason = open[1].trim();
    if (reason.length < 40) problems.push('reason too short');
    if (reasons.has(reason)) problems.push('reason shared with another entry');
    reasons.set(reason, item);
  }
  return problems;
}

describe('docs · the Open list says which entries are work and which are history', () => {
  it('refuses an entry that says neither', () => {
    // The state all three stale entries were in.
    expect(judge(['- The six other scripts failed and were never examined.'])).toEqual([
      'neither closed nor explained',
    ]);
  });

  it('refuses a reason short enough to be a placeholder', () => {
    expect(judge(['- Something. [open: still to do]'])).toEqual(['reason too short']);
  });

  it('refuses two entries sharing a reason, because one is a placeholder', () => {
    const shared =
      'this is a reason long enough to pass the length rule and still be a placeholder';
    expect(judge([`- One. [open: ${shared}]`, `- Two. [open: ${shared}]`])).toEqual([
      'reason shared with another entry',
    ]);
  });

  it('accepts a closure with the finding that closed it, and needs no reason', () => {
    expect(judge(['- ~~An old item.~~ **Closed by finding 150**: the consumer arrived.'])).toEqual([]);
  });

  it('accepts an open entry whose reason is a sentence', () => {
    expect(
      judge([
        '- A residual. [open: it needs the measurement the entry is about, and that measurement ' +
          'does not exist yet]',
      ]),
    ).toEqual([]);
  });

  it('reads the shipped document and finds the two it closed', () => {
    // Non-vacuity for the fixtures above: the shipped file is judged by the same
    // predicates, so a document that reverted to plain prose would fail here.
    const shipped = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(`${shipped.stdout}${shipped.stderr}`).toContain('check-open-list: OK');
    expect(shipped.status).toBe(0);
    // And the count is stated, so an empty list cannot pass as a clean one.
    expect(shipped.stdout).toMatch(/5 entry\(ies\) in docs\/progress\.md/);
    expect(shipped.stdout).toMatch(/2 closed by a finding/);
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
