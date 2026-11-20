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
 * 6. A round holds **at most one** of each of its closing sections -- `### Readings`,
 *    `### Left open`, `### Unchanged` -- and once the log has begun carrying them,
 *    every round after that carries `### Readings`. Finding 309: v3.18 was inserted
 *    before v3.17's own `### Readings`, so v3.17 lost its ledger and v3.18 held two.
 *    Concatenation does not notice -- both halves are in the file, in order -- which
 *    is why the boundary needed a rule of its own rather than an eyeball.
 * 7. A ledger **names the round it belongs to**, on its first line: `> Ledger for
 *    \`v3.24\`.`, and the name is the round whose title sits above it. Rule 6 counts
 *    sections and cannot see a swap -- two rounds whose ledgers were exchanged each
 *    hold exactly one, each well formed -- and finding 309 recorded that as the half
 *    it left open. The block can answer the question if it is asked, and the answer
 *    travels with the block: an insertion at the wrong heading now carries the wrong
 *    name into the round it landed in. What this cannot do is stop a forger who edits
 *    the name as well; the guard's subject is the accident, not the lie.
 * 8. One ledger describes **one tree**: the `(as of \`sha\`)` markers inside a ledger,
 *    where it has any, all name the same commit. A ledger assembled by copying half of
 *    another round's ledger is two measurements under one title.
 * 9. The summary prints the **population** it counted rather than a word for it:
 *    `268 heading(s): 215 vX.YY round(s), 1 addendum(s), 50 Pass round(s), 2 unnumbered`.
 *    It printed `268 round(s)`, and 268 is a count of `## ` headings -- finding 585's error,
 *    a heading count published as a round count, in the file next door. It survived there
 *    because 585 repaired a subtraction and left the summary printing the same mixture, and
 *    `check-open-list` prints **215** for the rounds, so two gates published one word for two
 *    populations and neither line said which (finding 600). A heading shaped like a round that
 *    this module cannot label is refused, because the two readers would then count different
 *    corpora and the difference would arrive as "unnumbered".
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
/**
 * A heading that begins the way a round begins, whatever follows the number.
 *
 * The other reader of this corpus, `check-open-list.mjs`, identifies a round with
 * `/^## (v(\d+)\.(\d+))\b/` -- a word boundary, so `## v3.62` followed by anything at all is round
 * `v3.62`. `VERSION` above needs a space and then a title, which a heading written without one
 * does not have. Two regexes over one corpus is not a defect; two different answers published as
 * two populations of the same word is, and that is what the summary was doing (finding 600).
 */
const SHAPED_LIKE_ROUND = /^## v\d+\.\d+/;
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
 * The entries, partitioned by the kind of name they carry.
 *
 * The summary used to print `order.length` as "round(s)", and that number is every `## ` heading a
 * volume holds -- fifty `Pass` rounds, one addendum and two sections with no number included. The
 * count of `vX.YY` rounds is the one the rest of this repository means by "round", and it is the
 * one `check-open-list` prints, so the two lines were publishing 215 and 268 under one word with
 * nothing on either line to say they were different questions (finding 600).
 *
 * The buckets are a **partition** of `labelOf`, which returns `Pass N`, `vX.YY`,
 * `vX.YY, addendum`, or null: every entry lands in exactly one, so the four numbers add up to the
 * total by construction rather than by a rule that could disagree with them, and a heading nobody
 * can name is counted as `unnumbered` instead of disappearing.
 */
export function populationsOf(entries) {
  const populations = { version: 0, addendum: 0, pass: 0, unnumbered: 0 };
  for (const entry of entries) {
    const label = entry.label;
    if (label === null) populations.unnumbered += 1;
    else if (label.endsWith(', addendum')) populations.addendum += 1;
    else if (label.startsWith('Pass ')) populations.pass += 1;
    else populations.version += 1;
  }
  return populations;
}

/**
 * The entries of one volume: heading text, label, and byte offset.
 *
 * Fences are tracked because a round may **quote** a heading -- `v2.26` quotes four
 * example headings that are not headings, and `v2.27` quotes a verdict block -- and
 * counting a quotation as an entry would report a volume as holding rounds it does
 * not hold. The audit guard learned this by being wrong about its own example.
 */
function entriesOf(text) {
  const out = [];
  let fenced = false;
  let offset = 0;
  let index = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
    } else if (!fenced && line.startsWith('## ')) {
      out.push({ heading: line, label: labelOf(line), offset, line: index });
    }
    offset += Buffer.byteLength(`${line}\n`);
    index += 1;
  }
  return out;
}

/**
 * The closing sections a round carries, counted between two `## ` headings.
 *
 * Fences are tracked for the reason `entriesOf` tracks them: `v2.26` quotes headings
 * that are not headings, and a quoted `### Unchanged` is not a section.
 */
export const CLOSING_SECTIONS = ['### Readings', '### Left open', '### Unchanged'];

function closingSectionsIn(lines, from, to) {
  const counts = new Map();
  let fenced = false;
  for (const raw of lines.slice(from, to)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const line = raw.trim();
    if (CLOSING_SECTIONS.includes(line)) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

/**
 * The line that says which round a ledger belongs to.
 *
 * A ledger is a table of numbers measured against a tree, and the tree belongs to one
 * round. Where the table sits is a **position**, and a position is what finding 309
 * proved insufficient: v3.18 was inserted at v3.17's `### Readings` heading, so the
 * table stayed where it was and the block opened above it -- every byte present, in
 * order, and the round that produced the numbers was not the round they appeared in.
 *
 * So the ledger states its own subject, in one line, above the table. It is a claim
 * rather than a comment: it can be wrong, and being wrong is the point.
 */
export const LEDGER_LINE = /^> Ledger for `([^`]+)`\.$/;

/** `(as of \`2aed8ce\`)`, the count-row idiom the ledger's suite rows already carry. */
const AS_OF = /as of `([0-9a-f]{7,40})`/g;

/**
 * `| coverage | core 99.97 / 99.80 / 100 / 99.97, cli 100 / 100 / 100 / 100 |`.
 *
 * The label is all the pattern insists on; how many four-number groups follow is a
 * separate question, asked of the newest round only (see `readVolumes`).
 */
const COVERAGE_ROW = /^\|\s*coverage\s*\|\s*(.*?)\s*\|\s*$/;

/**
 * `| the number line | **215 -> 216** distinct numbers, dense: … |`, the row five rounds have carried.
 *
 * Optional, and judged only where it exists and only on the round that can still be written: it is an
 * editorial row rather than a schema, and a round that says nothing about the number line is not making
 * a claim that can be wrong. What the row *does* claim is a count of this corpus, and a count of this
 * corpus is derivable -- so a row that states one has to state this one (finding 601).
 */
const NUMBER_LINE_ROW = /^\|\s*(?:the\s+)?number line\s*\|\s*(.*?)\s*\|\s*$/i;

/** Whether a free-form cell states `number` as a number, rather than as part of a longer one. */
function statesNumber(cell, number) {
  return new RegExp(`(?:^|[^0-9])${String(number)}(?:[^0-9]|$)`).test(cell.replace(/,/g, ''));
}

/** One `a / b / c / d` group: statements, branches, functions, lines. */
const QUAD = /\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?/g;

/**
 * What one ledger says about itself: the round it names, and the trees it was measured on.
 *
 * `anchor` is `null` when the first non-blank line is not the ledger line, and `first`
 * carries that line so the refusal can quote what it found instead of describing it.
 * `shas` is every distinct `(as of \`sha\`)` in the section, in order of appearance.
 */
function ledgerOf(lines, from, to) {
  let fenced = false;
  let first = null;
  const shas = [];
  const coverage = [];
  let numberLine = null;
  for (const raw of lines.slice(from, to)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const row = COVERAGE_ROW.exec(raw.trim());
    if (row !== null) coverage.push({ cell: row[1], quads: (row[1].match(QUAD) ?? []).length });
    const line = NUMBER_LINE_ROW.exec(raw.trim());
    if (line !== null) numberLine = line[1];
    if (first === null) {
      if (raw.trim() === '') continue;
      first = raw.trim();
      for (const match of first.matchAll(AS_OF)) if (!shas.includes(match[1])) shas.push(match[1]);
      continue;
    }
    for (const match of raw.matchAll(AS_OF)) if (!shas.includes(match[1])) shas.push(match[1]);
  }
  const anchor = LEDGER_LINE.exec(first ?? '');
  return { first, anchor: anchor === null ? null : anchor[1], shas, coverage, numberLine };
}

/** The line index of a closing section inside one round, or `null` when it holds none. */
function sectionLineOf(lines, from, to, name) {
  let fenced = false;
  for (let at = from; at < to; at += 1) {
    const raw = lines[at];
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && raw.trim() === name) return at;
  }
  return null;
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
    // The budget is judged on the volume that can still grow, and only there.
    //
    // The number exists to force a decision -- start the next volume before this one
    // becomes a pile -- and only the last volume can take that decision: the others are
    // closed, and nothing appends to them. Applying it to them meant that a repair of
    // more than the remaining bytes was refused with advice the volume could not follow,
    // which is the wrong answer to a repair (finding 208).
    //
    // The cost is that a closed volume could be grown by an edit and no gate would red.
    // That is accepted and stated rather than guarded: the sizes of every volume are
    // printed on each run, so a volume that doubled would be visible in the line every
    // reader of a red build already looks at, and no rule needs to exist for a thing
    // nobody has done.
    const isLast = position === names.length - 1;
    if (isLast && bytes > MAX_BYTES) {
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
    const lines = text.split('\n');
    for (const [position, entry] of entries.entries()) {
      const end = entries[position + 1]?.line ?? lines.length;
      entry.sections = closingSectionsIn(lines, entry.line + 1, end);
      // A heading only one of the two readers can name. `check-open-list` calls `## v3.62 —
      // title` and `## v3.62-title` the same round; this module labels the first and would file
      // the second under "unnumbered", so the two summaries would disagree about one heading and
      // each would be right about its own regex (finding 600). The repair is the title every
      // other round carries, not a looser pattern: the pattern is what makes a round citable.
      if (entry.label === null && SHAPED_LIKE_ROUND.test(entry.heading)) {
        errors.push(
          `${name}: \`${entry.heading.trim()}\` begins like a round and carries no title this module can ` +
            'read: rounds are `## vX.YY — what it found`, and `check-open-list` counts that heading as a ' +
            'round while this one counts it as unnumbered -- write the space and the title (finding 600)',
        );
      }
      for (const [section, count] of entry.sections) {
        if (count > 1) {
          errors.push(
            `${name}: \`${entry.heading.trim()}\` holds ${String(count)} \`${section}\` sections -- a round ` +
              `closes itself once, and the second one belongs to the round that was inserted before it (finding 309)`,
          );
        }
      }
      const ledgerLine = sectionLineOf(lines, entry.line + 1, end, '### Readings');
      if (ledgerLine !== null) {
        const ledger = ledgerOf(lines, ledgerLine + 1, end);
        entry.ledger = ledger;
        if (entry.label === null) {
          errors.push(
            `${name}: \`${entry.heading.trim()}\` carries a \`### Readings\` section and no label a reader could ` +
              'cite: a ledger names the round it belongs to, and this one has no name to give',
          );
        } else if (ledger.anchor === null) {
          errors.push(
            `${name}: \`${entry.heading.trim()}\` holds a \`### Readings\` section whose first line is ` +
              `\`${(ledger.first ?? '').slice(0, 60)}\`, not \`> Ledger for \`${entry.label}\`.\` -- the table states ` +
              'which round measured it, and a position is not an owner (finding 309)',
          );
        } else if (ledger.anchor !== entry.label) {
          errors.push(
            `${name}: \`${entry.heading.trim()}\` holds a \`### Readings\` section that says it measured ` +
              `\`${ledger.anchor}\`: the ledger belongs to the round whose title sits above it, and this one is ` +
              `\`${entry.label}\` -- the block was written for one round and filed under another (finding 309)`,
          );
        }
        if (ledger.shas.length > 1) {
          errors.push(
            `${name}: \`${entry.heading.trim()}\` measures one ledger against ${String(ledger.shas.length)} trees ` +
              `(${ledger.shas.join(', ')}): one ledger describes one commit, and rows from two rounds under one ` +
              'title are two measurements that will drift apart',
          );
        }
      }
    }
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

  // The ledger does not thin out. Once a round carries `### Readings`, the round after it
  // does too -- and a round that does not is the other half of finding 309: the section
  // that was written for it is sitting in the round that was inserted before it. This is
  // a **chain**, not a list of numbers: which round the convention started at is a fact
  // the volume itself holds, and pinning `v3.13` here would be a literal that rots.
  for (let at = 1; at < order.length; at += 1) {
    const before = order[at - 1];
    const after = order[at];
    const carried = before.sections?.get('### Readings') ?? 0;
    const own = after.sections?.get('### Readings') ?? 0;
    if (carried > 0 && own === 0) {
      errors.push(
        `\`${after.heading.trim()}\` follows \`${before.heading.trim()}\`, which closes with \`### Readings\`, and ` +
          'carries none: a round after the ledger began states its own readings, and a missing one means the ' +
          'section ended up past the heading of the round that follows it (finding 309)',
      );
    }
  }

  // The ledger owes a coverage row, and the rule is judged on the round that can still be
  // written.
  //
  // Why not the chain, the way `### Readings` is: **30 of the log's first 54 ledgers carry no
  // coverage row**, spread in runs across volumes 05 to 07. A rule over history would be red on
  // every run from the moment it existed, and a rule that is always red is a rule every reader
  // learns to skip -- the argument the volume budget already makes for judging only the volume
  // that can still grow. What the newest round owes is what the next one inherits, so the
  // convention propagates without reddening a single closed record.
  //
  // Two packages and four dimensions, because that is the table `pnpm test:coverage` prints and
  // the reason the row exists: a reader compares it against that table. Extra sentences beside
  // the numbers are read as prose and not judged.
  const newest = order.at(-1);
  if (newest !== undefined && (newest.sections?.get('### Readings') ?? 0) > 0) {
    const quads = (newest.ledger?.coverage ?? []).reduce((n, row) => (row.quads >= 2 ? n + 1 : n), 0);
    if (quads === 0) {
      const cell = newest.ledger?.coverage?.[0]?.cell;
      errors.push(
        `\`${newest.heading.trim()}\` is the round that can still be written, and its \`### Readings\` ` +
          (cell === undefined
            ? 'carries no `| coverage |` row: the four dimensions per package are the one reading this ' +
              'repository takes on every run, and the round that measures them is the only place their cost ' +
              'is recorded (finding 475)'
            : `carries \`${cell.slice(0, 80)}\`, which does not report four numbers for \`core\` and four ` +
              'for `cli`: a reader compares that row against the table `pnpm test:coverage` prints, and a row ' +
              'that reports fewer dimensions cannot be compared with it (finding 475)'),
      );
    }
  }

  // ## The number line, when a round states one, states this corpus's (finding 601)
  //
  // Five ledgers carried a count of the `vX.YY` numbers that was one behind the log: `v3.116` said 210,
  // `v3.117` 211, `v3.118` 212, `v3.119` 212 -> 213, `v3.120` 213 -> 214, while the corpus held 211, 212,
  // 213, 214, 215. Each was the count of the log **as it stood before the round's own heading**, quoted
  // with a range ending at the round before it -- so the row agreed with itself and not with the log it
  // sits in, which is finding 586's shape (a number derived before the change it describes) surviving in
  // the one row whose whole job is to be a count.
  //
  // The repair is a rule rather than five corrections: a row that says how many numbers this corpus has
  // must state the number it has. It is judged only on the round that can still be written, for the reason
  // the coverage row is, and only where the row exists -- a round that says nothing about the number line
  // is not making a claim. `populationsOf` is the derivation, so the number is the corpus's rather than a
  // literal that rots.
  const newestPopulations = populationsOf(order);
  const stated = newest?.ledger?.numberLine;
  if (stated != null && !statesNumber(stated, newestPopulations.version)) {
    // Quoted whole where it fits, because a cell is a table row and half of one is not a quote; cut
    // with a visible mark where it does not, so an unterminated code span reads as a truncation
    // rather than as a broken diagnostic.
    const quote = stated.length > 160 ? `${stated.slice(0, 157)}...` : stated;
    errors.push(
      `\`${newest.heading.trim()}\` states its number line as \`${quote}\`, which does not ` +
        `hold ${String(newestPopulations.version)}: the corpus has ${String(newestPopulations.version)} ` +
        'distinct `vX.YY` numbers, and a row counted before the round that writes it is one behind -- state ' +
        'the number this round\'s corpus has (finding 601)',
    );
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
  // Named, not only measured. The same defect as `audit-volumes.mjs`'s summary (finding 294): a size
  // without a subject invites the reader to supply one, and the reader has just been writing in the
  // newest volume rather than in the fullest. Here the answer is almost always the newest, which is
  // what made it worth fixing anyway -- a reading that is usually right is the one nobody checks.
  const fullest = volumes.length === 0 ? null : volumes.reduce((left, right) => (right.bytes > left.bytes ? right : left));

  // The index must stay smaller than the volume that is **still open**.
  //
  // ## Why a relation rather than a number
  //
  // Finding 202 recorded that a pinned number is a property of the whole corpus: pin the
  // count of test files and any new file retires the pin. A byte budget would fail the
  // same way if it were chosen to fit today's index -- and it would also say nothing,
  // because the question is not "how big may the index be" but "what is the index for".
  //
  // The relation answers the second question with the document's own structure: the file
  // a reader opens **first**, to find their way to the others, must not be bigger than the
  // thing it is still being compared with. The two numbers are printed on every run rather
  // than quoted here, because a literal in a comment is a number that rots -- and this
  // paragraph used to quote one ("about twenty kilobytes of headroom -- six rounds"),
  // which v2.47 measured at 5.9 kilobytes and one round.
  //
  // ## Why the open volume and not the smallest (finding 501)
  //
  // The set used to be **every** volume, read as "the things it indexes", and the bound is
  // then the smallest one -- which was closed eleven volumes ago and cannot grow. A bound
  // that cannot move is a constant wearing a relation's clothes: it was 955 bytes at the
  // start of v3.76 and 15 at the end, and the refusal it produced named two repairs,
  // neither of which existed. The section that had grown was `## Open`, which is the
  // index's own content by design, and no record may be appended to a volume frozen at
  // v3.55. So the round shaved three paragraphs of its own new entries until the
  // arithmetic fitted, which is the shape this audit keeps finding: a number that is
  // checked, and a repair that is not available.
  //
  // The volume still being written is the only one a comparison can act on, and it grows
  // with every round -- so the headroom grows rather than shrinking toward a wall at a
  // fixed distance. The two repairs the refusal names are now both real: a section that
  // grew and is a record belongs in a volume, and an index that has stopped being an index
  // is answered by moving the whole of `## Open` out.
  //
  // What this gives up is stated rather than hidden: the index may now be bigger than a
  // closed volume, and it is -- the smallest closed volume is smaller than the index by the
  // time a few rounds have been written. That is accepted for the reason the volume budget
  // is judged only on the last volume (finding 208): a closed volume is a record of a size
  // it had, and comparing against it constrains the future with a fact about the past.
  //
  // The split instruction survives, and it is the reason v2.47's split moved twenty-one
  // rounds: a new volume must be **born** larger than the index, or the relation is false
  // the moment the boundary is drawn. The index's own ceiling follows by transitivity --
  // it can never exceed `MAX_BYTES`, because the open volume it must stay under cannot --
  // so when the index reaches the volume budget, the live list has become a document.
  const indexBytes = Buffer.byteLength(indexText, 'utf8');
  const open = volumes.at(-1);
  const openBytes = open?.bytes ?? 0;
  const populations = populationsOf(order);
  if (open !== undefined && indexBytes >= openBytes) {
    errors.push(
      `docs/progress.md is ${String(indexBytes)} bytes and \`${open.name}\`, the volume that is still ` +
        `open, is ${String(openBytes)}: the index outgrew the one file it is still being compared ` +
        'with, so either the section that grew is a record and belongs in a volume, or the index is ' +
        'no longer an index (finding 501)',
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    volumes,
    order,
    summary:
      `check-progress-volumes: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(volumes.length)} volume(s), ` +
      `${String(order.length)} heading(s): ${String(populations.version)} \`vX.YY\` round(s), ` +
      `${String(populations.addendum)} addendum(s), ${String(populations.pass)} \`Pass\` round(s), ` +
      `${String(populations.unnumbered)} unnumbered` +
      (fullest === null
        ? ''
        : `; largest ${fullest.name} at ${fullest.bytes.toLocaleString('en-US')} of ` +
          `${MAX_BYTES.toLocaleString('en-US')} bytes`) +
      (volumes.length === 0
        ? ''
        : `; sizes ${volumes.map((one) => one.bytes.toLocaleString('en-US')).join(' / ')}`) +
      (open === undefined
        ? ''
        : `; index ${indexBytes.toLocaleString('en-US')} of open volume ` +
          `${openBytes.toLocaleString('en-US')}`),
  };
}
