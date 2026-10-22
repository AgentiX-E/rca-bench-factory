#!/usr/bin/env node
/**
 * What the progress log's split means, as functions and no verdict.
 *
 * ## Why this is a module and not the gate
 *
 * The same reason `audit-volumes.mjs` is one, and it was paid for once already:
 * `verify-gates-are-testable.mjs` proves a gate by emptying it, and an emptied
 * file that a test imports kills the worker before it can name a failing test --
 * `UNATTRIBUTED`, the one verdict the meta-gate refuses. So the reading is here,
 * importable, and `check-progress-volumes.mjs` beside it does the verdict and is
 * only ever spawned.
 *
 * ## Why the split is by run order
 *
 * `docs/progress.md` reached 519,758 bytes, which is the size at which a document
 * stops being one. The audit log was split by **size** because its entries are
 * independent: a finding is cited by number, and a number does not care which
 * volume holds it. A round is not that. It is read as a sequence -- the round that
 * says "the fix did not work" means what it says only because the round before it
 * described the fix -- so the rule here is a **contiguous run of rounds**, and the
 * volumes tile the log: concatenated, they are the body that was moved, byte for
 * byte. The migration was proven that way rather than asserted, and this check
 * holds the consequence (a boundary between two entries, never inside one).
 *
 * ## What is enforced
 *
 * 1. Volumes are `docs/progress/volume-NN.md`, numbered from `01`, contiguous.
 * 2. Each is under `MAX_BYTES`, and each **begins at a `## ` heading** -- a volume
 *    that starts mid-entry is a boundary drawn through a sentence.
 * 3. Findings are ordered: `Pass N` strictly increasing, `vX.YY` non-decreasing,
 *    and no `Pass N` after the first `vX.YY`. The two naming schemes are the two
 *    eras of this log, and an entry from one era filed among the other is a round
 *    that has been moved.
 * 4. `docs/progress.md` names every volume exactly once, in a row whose entry count
 *    and first/last labels are the file's rather than the row's claim.
 * 5. `docs/progress.md` itself holds **no** entry heading: the rounds moved, and an
 *    index that still carried one would be two homes for one round.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
export const INDEX = join(ROOT, 'docs', 'progress.md');
export const VOLUMES = join(ROOT, 'docs', 'progress');

/**
 * The budget for one volume.
 *
 * Smaller than the audit log's 280,000 on purpose: a round costs 2–15 KB and
 * arrives far more often than a finding, so the number that matters is not "how
 * much fits" but "how many rounds of headroom". 200,000 leaves roughly fifteen.
 */
export const MAX_BYTES = 200_000;

/** `## Pass 34 -- …` and `## Pass 34 — …`, which are the two dash spellings in use. */
const PASS = /^## Pass (\d+) (?:—|--) /;
/** `## v2.06 — …`, and `## v2.15, addendum — …`. */
const VERSION = /^## v(\d+)\.(\d+)(, addendum)? /;
/** Any heading that starts an entry, in either era or in the two unnumbered cases. */
const ENTRY = /^## (?:Pass \d+ |v\d+\.\d+|Finding \d+ |Iteration )/;

/**
 * Read a label: what a reader would use to cite this round.
 *
 * `null` for an entry with no number (`## Finding 124 — …`, `## Iteration — …`):
 * those two are rounds that were not part of either numbering, and inventing a
 * label for them would make the table claim an order the log does not have.
 */
export function labelOf(heading) {
  const pass = PASS.exec(heading);
  if (pass !== null) return `Pass ${pass[1]}`;
  const version = VERSION.exec(heading);
  if (version !== null) return `v${version[1]}.${version[2]}${version[3] ?? ''}`;
  return null;
}

/**
 * The entries of one volume: heading text, label, and byte offset.
 *
 * Fences are tracked because a round may **quote** a heading -- `v2.26` quotes four
 * example headings that are not headings, and `v2.27` quotes a verdict block -- and
 * counting a quotation as an entry would report a volume as holding rounds it does
 * not hold. The audit guard learned this by being wrong about its own example.
 */
export function entriesOf(text) {
  const out = [];
  let fenced = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
    } else if (!fenced && line.startsWith('## ')) {
      out.push({ heading: line, label: labelOf(line), offset });
    }
    offset += Buffer.byteLength(`${line}\n`);
  }
  return out;
}

/** Every volume, in order, with what it holds and what is wrong with it. */
export function readVolumes(dir = VOLUMES) {
  let names;
  try {
    names = readdirSync(dir).filter((name) => /^volume-\d+\.md$/.test(name)).sort();
  } catch {
    return {
      volumes: [],
      errors: [
        `no \`${dir.replace(`${ROOT}/`, '')}/\` directory: the rounds live in volumes, and an index ` +
          'with no volumes behind it is a table of contents for a log that is not there',
      ],
      order: [],
    };
  }

  const errors = [];
  const volumes = [];
  const order = [];

  names.forEach((name, position) => {
    const expected = `volume-${String(position + 1).padStart(2, '0')}.md`;
    if (name !== expected) {
      errors.push(
        `${name}: volumes are numbered from 01 without gaps, so this one should be \`${expected}\``,
      );
    }
    const path = join(dir, name);
    const text = readFileSync(path, 'utf8');
    const bytes = statSync(path).size;
    if (bytes > MAX_BYTES) {
      errors.push(
        `${name} is ${String(bytes)} bytes, and the budget is ${String(MAX_BYTES)}: start the next volume, ` +
          'move the newest round into it, and add its row to docs/progress.md',
      );
    }
    if (!text.startsWith('## ')) {
      errors.push(
        `${name} does not begin at a \`## \` heading: a volume starts where a round starts, or the boundary ` +
          'was drawn through a sentence',
      );
    }
    const entries = entriesOf(text);
    if (entries.length === 0) errors.push(`${name}: no \`## \` heading, so it holds no round`);
    for (const entry of entries) order.push(entry);
    volumes.push({
      name,
      bytes,
      count: entries.length,
      first: entries[0]?.label ?? null,
      last: entries.at(-1)?.label ?? null,
    });
  });

  if (volumes.length === 0 && errors.length === 0) errors.push('no volumes, so there is no log');

  // The ordering rules, over the whole log rather than per volume: two volumes that
  // disagree about the order are one log that does, and only the concatenation can
  // say so.
  let lastPass = null;
  let lastVersion = null;
  let previous = null;
  for (const entry of order) {
    const pass = PASS.exec(entry.heading);
    const version = VERSION.exec(entry.heading);
    if (pass !== null) {
      const number = Number(pass[1]);
      if (lastVersion !== null) {
        errors.push(
          `${entry.heading.trim()} comes after v${lastVersion[0]}.${lastVersion[1]}: the log has two eras, ` +
            'and a `Pass` round filed among the versions has been moved',
        );
      } else if (lastPass !== null && number <= lastPass) {
        errors.push(
          `${entry.heading.trim()} comes after Pass ${String(lastPass)}: rounds are ordered by number, and a ` +
            'round that does not advance has been moved or duplicated',
        );
      }
      lastPass = number;
    } else if (version !== null) {
      const pair = [Number(version[1]), Number(version[2])];
      if (lastVersion !== null) {
        const [major, minor] = lastVersion;
        const backwards = pair[0] < major || (pair[0] === major && pair[1] < minor);
        const equal = pair[0] === major && pair[1] === minor;
        if (backwards) {
          errors.push(
            `${entry.heading.trim()} comes after v${String(major)}.${String(minor)}: the log is ordered by version`,
          );
        } else if (equal && version[3] === undefined) {
          errors.push(
            `${entry.heading.trim()} repeats v${String(major)}.${String(minor)}: only an \`, addendum\` entry may ` +
              'share a version with the one before it',
          );
        }
      }
      lastVersion = pair;
    }
    previous = entry;
  }

  return { volumes, errors, order };
}

/**
 * Whether the index names each volume exactly once, with the numbers the file has.
 *
 * The row is **checked** rather than trusted, for the reason the audit index gives:
 * a reader picks a volume by it, and a table that has drifted is worse than none.
 * An append to the last volume changes one row, and this is what says so.
 */
export function indexCovers(indexText, volumes) {
  const errors = [];
  const rows = new Map();
  for (const line of indexText.split('\n')) {
    const row = /^\| \[(volume-\d+\.md)\]\(progress\/volume-\d+\.md\) \| (\d+) \| ([^|]+?) \| ([^|]+?) \|$/.exec(line);
    if (row !== null) rows.set(row[1], { count: Number(row[2]), first: row[3].trim(), last: row[4].trim() });
  }
  for (const volume of volumes) {
    const mentions = indexText.split(`progress/${volume.name}`).length - 1;
    if (mentions !== 1) {
      errors.push(
        `docs/progress.md mentions \`progress/${volume.name}\` ${String(mentions)} time(s); every volume needs ` +
          'exactly one row, or a volume exists that a reader cannot reach',
      );
      continue;
    }
    const row = rows.get(volume.name);
    if (row === undefined) {
      errors.push(
        `docs/progress.md names \`progress/${volume.name}\` but not in a row this reader can read: the row is ` +
          '`| [volume-NN.md](progress/volume-NN.md) | entries | first | last |`',
      );
      continue;
    }
    if (row.count !== volume.count || row.first !== volume.first || row.last !== volume.last) {
      errors.push(
        `docs/progress.md says ${volume.name} holds ${String(row.count)} entries ` +
          `${row.first}–${row.last}; the file holds ${String(volume.count)} ${String(volume.first)}–` +
          `${String(volume.last)}. Update the row -- a reader picks a volume by it`,
      );
    }
  }
  return errors;
}

/** Any entry heading left behind in the index, which would be two homes for one round. */
export function straysIn(indexText) {
  const errors = [];
  let fenced = false;
  for (const line of indexText.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && ENTRY.test(line)) {
      errors.push(
        `docs/progress.md still holds \`${line.trim()}\`: the rounds live in the volumes, and a round with two ` +
          'homes is a round that will be edited in the wrong one',
      );
    }
  }
  return errors;
}

export function check(indexText, dir = VOLUMES) {
  const { volumes, errors, order } = readVolumes(dir);
  for (const problem of indexCovers(indexText, volumes)) errors.push(problem);
  for (const problem of straysIn(indexText)) errors.push(problem);
  const largest = volumes.length === 0 ? 0 : Math.max(...volumes.map((one) => one.bytes));

  // The index must stay smaller than the smallest volume.
  //
  // ## Why a relation rather than a number
  //
  // Finding 202 recorded that a pinned number is a property of the whole corpus: pin the
  // count of test files and any new file retires the pin. A byte budget would fail the
  // same way if it were chosen to fit today's index -- and it would also say nothing,
  // because the question is not "how big may the index be" but "what is the index for".
  //
  // The relation answers the second question with the document's own structure: the file
  // a reader opens **first**, to find their way to the others, must not be bigger than
  // the things it indexes. It holds about twenty kilobytes of headroom -- six rounds at
  // the current rate -- and when it loses that, the split stops being an opinion and
  // becomes an instruction. The two numbers are printed on every run rather than quoted
  // here, because a literal in a comment is a number that rots.
  //
  // Measured before writing this: the index was said in v2.28 to be "the largest single
  // file in `docs/`", and it is the **smallest** of the five progress files. The claim
  // was never measured; the relation is.
  const indexBytes = Buffer.byteLength(indexText, 'utf8');
  const smallest = volumes.length === 0 ? 0 : Math.min(...volumes.map((one) => one.bytes));
  if (smallest > 0 && indexBytes >= smallest) {
    errors.push(
      `docs/progress.md is ${String(indexBytes)} bytes and the smallest volume is ${String(smallest)}: the ` +
        'index has outgrown something it indexes, so either the section that grew is a record and belongs ' +
        'in a volume, or the index is no longer an index',
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    volumes,
    order,
    summary:
      `check-progress-volumes: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(volumes.length)} volume(s), ` +
      `${String(order.length)} round(s)` +
      (order.length === 0 ? '' : `; largest ${largest.toLocaleString('en-US')} of ` +
        `${MAX_BYTES.toLocaleString('en-US')} bytes`) +
      (smallest === 0 ? '' : `; index ${indexBytes.toLocaleString('en-US')} of smallest volume ` +
        `${smallest.toLocaleString('en-US')}`),
  };
}
