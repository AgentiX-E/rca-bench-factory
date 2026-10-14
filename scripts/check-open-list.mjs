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
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DOCS = [
  { path: 'docs/progress.md', heading: '### Open' },
];

const CLOSED = /~~|Closed by finding \d+/;
const OPEN = /\[open:\s*([^\]]*)\]/;

/** The lines of the section that starts at `heading`, up to the next heading of the same level. */
function sectionLines(doc, heading) {
  const lines = doc.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const level = heading.match(/^#+/)[0].length;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#+\s/.test(line) && line.match(/^#+/)[0].length <= level) break;
    out.push(line);
  }
  return out;
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

function check() {
  const problems = [];
  for (const doc of DOCS) {
    let text;
    try {
      text = readFileSync(resolve(ROOT, doc.path), 'utf8');
    } catch (error) {
      problems.push(`cannot read ${doc.path}: ${error.message}`);
      continue;
    }
    const lines = sectionLines(text, doc.heading);
    if (lines === null) {
      problems.push(`${doc.path} has no \`${doc.heading}\` heading; the list this guard reads is gone`);
      continue;
    }
    const items = entries(lines);
    if (items.length === 0) {
      problems.push(`${doc.path}'s \`${doc.heading}\` section is empty, so this guard has no subject`);
      continue;
    }
    const reasons = new Map();
    for (const item of items) {
      const first = item.split('\n')[0].slice(2).trim();
      if (CLOSED.test(item)) continue;
      const open = item.match(OPEN);
      if (!open) {
        problems.push(
          `${doc.path}: an entry says neither that it is closed nor why it is open, so a reader ` +
            `cannot tell work from history: ${first.slice(0, 80)}`,
        );
        continue;
      }
      const reason = open[1].trim();
      if (reason.length < 40) {
        problems.push(
          `${doc.path}: the open reason is ${reason.length} character(s); "still open" is not a ` +
            `reason: ${first.slice(0, 60)}`,
        );
      }
      if (reasons.has(reason)) {
        problems.push(
          `${doc.path}: two entries share an open reason (${reason.slice(0, 40)}), so one of them is ` +
            'a placeholder that will be re-signed without being read',
        );
      }
      reasons.set(reason, first);
    }
    const closed = items.filter((item) => CLOSED.test(item)).length;
    console.log(
      `check-open-list: OK (${items.length} entry(ies) in ${doc.path}: ${items.length - closed} open ` +
        `with a reason, ${closed} closed by a finding)`,
    );
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

