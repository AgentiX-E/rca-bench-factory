#!/usr/bin/env node
/**
 * Hold the `## Repository` table in `docs/progress.md` to the tree it describes.
 *
 * ## The defect this exists for
 *
 * That table answers one question -- how big is this repository -- with eight rows, and
 * until this guard existed **not one of the eight was read by anything**. The document's
 * own prose says the numbers are "re-taken from `git ls-files` and `git rev-list --count
 * HEAD` at this revision", and the sentence had been true at pass 13 and at no revision
 * since. Measured against the tree this guard was written on:
 *
 *     | row           | published | the tree |
 *     | Commits       |        95 |      530 |
 *     | Source files  |        45 |       97 |
 *     | Source lines  |    13,483 |   31,478 |
 *     | Test files    |  78 core  | 244 core |
 *     | Test lines    |    25,174 |   98,474 |
 *     | Tests         |      2341 |     6246 |
 *     | Tracked files |       208 |      633 |
 *
 * Every row wrong, the smallest error a factor of two and the largest a factor of six, in
 * a document whose first principle is that a claim about compliance is only accepted when
 * something produced it. The table decayed because it is a *current-state* table and the
 * repository changes on every commit: a number nobody re-reads is a number that is right
 * exactly once.
 *
 * ## Why it could decay: the guards that read counts read other texts
 *
 * `check-doc-counts.mjs` reads 349 published counts out of this same file and refuses a
 * label that names the wrong scope. It does not read this table, because its subject is
 * *rows that carry a count-bearing phrase* in a shape it knows, and the table's rows are
 * `| Tests | 2341 core + 173 CLI |` -- a shape whose label names no scope in its
 * vocabulary. So the one table in the corpus that publishes the repository's own size was
 * the one table with no reader, and the numbers in it had been copied forward by hand for
 * a hundred and twenty rounds.
 *
 * ## What is checked
 *
 *   1. **Every row's label names a derivation this guard performs.** The vocabulary is
 *      closed: an unknown label is refused rather than skipped, because a skipped row is
 *      the defect -- a number with no reader -- wearing a new name.
 *   2. **Every derivation in the vocabulary appears exactly once.** A row deleted to make
 *      the table true is a repair, but a row deleted to make a failure go away is not, and
 *      the two look identical unless the vocabulary is required to be complete.
 *   3. **The value equals what the derivation produces**, exactly: the same integer, the
 *      same grouping, the same list order. Formatting is part of the claim, because a cell
 *      a reader cannot predict is a cell a reader cannot check.
 *   4. **`Commits` names the revision it was measured at, and that revision resolves.**
 *      This is the one row that cannot be current: the commit that writes it would be the
 *      commit it has to count. So it is *dated* instead of silent -- `Commits (at
 *      `d179592`)` -- and the date is checked rather than decorative.
 *   5. **The test-file and test counts agree with `golden-master/doc-counts.json`**, which
 *      the suite itself measures. Two accounts of one fact are compared here, so a glob in
 *      this guard that stopped matching cannot quietly describe a smaller repository.
 *
 * ## What is *not* checked, and said rather than implied
 *
 * The numbers describe the **working tree**, not `HEAD`: the row says `git ls-files`
 * because that is the measurement. A tree with uncommitted source edits therefore fails
 * this guard until the numbers are re-taken, which is the intended behaviour -- the table
 * describes the tree the gate ran on, and a reader who checks out the commit gets those
 * numbers only because the commit carried them.
 *
 * ## Usage
 *
 *   node scripts/check-repository-table.mjs           # fail when the table is stale
 *   node scripts/check-repository-table.mjs --write   # re-derive the cells, then verify
 *
 * `--write` rewrites nothing but the value cells of that one table. It prints the same
 * verdict afterwards by re-reading what it wrote, so a rewrite that produced a file this
 * guard cannot read fails in the same run instead of the next one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** One flag's value, or the fallback. Two flags is all this gate takes. */
function option(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}

// `--root` and `--doc` exist so the battery can drive this gate against a tree of five
// files instead of the one it lives in. Without them the only test possible is "the
// shipped document passes", which is the shape `docs/acceptance.md` records as a gate
// with no test: it can go green because nothing was checked.
const ROOT = resolve(option('--root', resolve(HERE, '..')));
const PROGRESS = resolve(option('--doc', join(ROOT, 'docs', 'progress.md')));
const SNAPSHOT = resolve(option('--snapshot', join(ROOT, 'golden-master', 'doc-counts.json')));

/** The heading of the section the table lives under. */
const HEADING = '## Repository';

/** Thousands separators, so a reader can count digits instead of characters. */
function grouped(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Every tracked path, as git reports it: the population all the file rows are cut from. */
function tracked() {
  return git(['ls-files', '-z'])
    .split('\u0000')
    .filter((path) => path !== '');
}

/** Newline count of one file, which is what `wc -l` means and what the row says. */
function lineCount(paths) {
  let total = 0;
  for (const path of paths) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) total += 1;
    // A file whose last line has no newline is still a line; `wc -l` counts only
    // terminators, so the row does too -- and the two agree because every file in this
    // repository ends with one, which `format-spec.mjs` enforces.
  }
  return total;
}

/** The workspace packages, as `packages/*\/package.json` names them, in name order. */
function packages() {
  const names = tracked()
    .filter((path) => /^packages\/[^/]+\/package\.json$/.test(path))
    .map((path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8')).name);
  return names
    .sort()
    .map((name) => `\`${name}\``)
    .join(', ');
}

/** How many commits are reachable from `rev`, and whether `rev` is one of them. */
function commitCount(rev) {
  // Resolved first, so a revision that does not exist is a refusal that says so rather
  // than a count of zero from a `rev-list` that failed for another reason.
  let resolved;
  try {
    resolved = git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).trim();
  } catch {
    // `rev-parse --quiet` exits non-zero for a revision it cannot resolve, which is the
    // refusal, and `execFileSync` turns that into a throw. A count of zero would be the
    // same message with a number in it, and the number would be wrong.
    return { error: `the revision \`${rev}\` does not resolve to a commit` };
  }
  if (resolved === '') return { error: `the revision \`${rev}\` does not resolve to a commit` };
  const count = Number(git(['rev-list', '--count', resolved]).trim());
  if (!Number.isSafeInteger(count) || count <= 0) {
    return { error: `git rev-list --count ${rev} reported '${String(count)}', which is not a count` };
  }
  return { count };
}

/**
 * The closed vocabulary: one entry per row, matched by label, with the derivation behind it.
 *
 * `derive` returns the cell text, or an object with an `error` when the measurement itself
 * failed -- a revision that does not resolve is not a stale number, and the two need
 * different sentences.
 */
const ROWS = [
  {
    name: 'Commits',
    shape: /^Commits \(at `([0-9a-f]{7,40})`\)$/,
    hint: 'Commits (at `<revision>`)',
    derive: (match) => {
      const measured = commitCount(match[1]);
      return measured.error === undefined ? grouped(measured.count) : measured;
    },
  },
  { name: 'Packages', shape: /^Packages$/, hint: 'Packages', derive: () => packages() },
  {
    name: 'Source files',
    shape: /^Source files$/,
    hint: 'Source files',
    derive: () => grouped(sourceFiles().length),
  },
  {
    name: 'Source lines',
    shape: /^Source lines$/,
    hint: 'Source lines',
    derive: () => grouped(lineCount(sourceFiles())),
  },
  {
    name: 'Test files',
    shape: /^Test files$/,
    hint: 'Test files',
    derive: () => perScope((suite) => grouped(suite.files().length)),
  },
  {
    name: 'Test lines',
    shape: /^Test lines$/,
    hint: 'Test lines',
    derive: () => perScope((suite) => grouped(lineCount(suite.files()))),
  },
  {
    name: 'Tests',
    shape: /^Tests$/,
    hint: 'Tests',
    derive: () => perScope((suite) => grouped(suite.tests())),
  },
  {
    name: 'Tracked files',
    shape: /^Tracked files$/,
    hint: 'Tracked files',
    derive: () => grouped(tracked().length),
  },
];

/**
 * Every `.ts` file under each package's `src/`, or under each package's `test/`.
 *
 * Read off the filesystem rather than out of `git ls-files`, and the first draft got this wrong
 * in a way the guard caught on itself: a test file that had not been committed yet was invisible
 * to the glob, so the row would have said 244 files while the runner that had just counted them
 * said 245. The two accounts are supposed to corroborate each other, and a glob that only sees
 * committed files cannot corroborate a suite that reads the working tree. `Tracked files` is the
 * one row that still means "tracked", which is why its label says so.
 */
function packageFiles(subdir) {
  const out = [];
  const root = join(ROOT, 'packages');
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const base = join(root, entry.name, subdir);
    if (!existsSync(base)) continue;
    for (const relative of readdirSync(base, { recursive: true })) {
      if (!relative.endsWith('.ts')) continue;
      out.push(`packages/${entry.name}/${subdir}/${relative.split(sep).join('/')}`);
    }
  }
  return out.sort();
}

/** The `.ts` files under every package's `src/`, which is what "source" means here. */
function sourceFiles() {
  return packageFiles('src');
}

/** One suite's file list and its test count, read from the measurement the suite wrote. */
function suites() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const built = [];
  for (const scope of ['core', 'cli']) {
    const measured = snapshot[scope];
    if (measured === undefined) {
      throw new Error(`${SNAPSHOT} carries no '${scope}' scope, so this row cannot be derived`);
    }
    const pattern = new RegExp(`^packages/${scope}/test/.*\\.test\\.ts$`);
    const files = packageFiles('test').filter((path) => pattern.test(path));
    built.push({
      scope,
      files: () => files,
      tests: () => measured.tests,
      measuredFiles: measured.files,
    });
  }
  return built;
}

/** `244 core + 4 cli`, with the disagreement between the two accounts refused, not averaged. */
function perScope(cell) {
  const parts = [];
  for (const suite of suites()) {
    if (suite.files().length !== suite.measuredFiles) {
      throw new Error(
        `packages/${suite.scope}/test holds ${String(suite.files().length)} test file(s) and the ` +
          `suite reported ${String(suite.measuredFiles)}: the glob and the runner disagree, so the row ` +
          'would describe a set neither of them is counting',
      );
    }
    parts.push(`${cell(suite)} ${suite.scope}`);
  }
  return parts.join(' + ');
}

/** The table's rows, as they are written: label, value, and the line they sit on. */
function readTable(text) {
  const lines = text.split('\n');
  const heading = lines.findIndex((line) => line.trim() === HEADING);
  if (heading === -1) return { error: `${PROGRESS} has no '${HEADING}' heading` };
  let cursor = heading + 1;
  while (cursor < lines.length && !/^\|\s*Metric\s*\|\s*Value\s*\|$/.test(lines[cursor].trim())) {
    if (/^##\s/.test(lines[cursor])) return { error: `${HEADING} holds no '| Metric | Value |' table` };
    cursor += 1;
  }
  if (cursor >= lines.length) return { error: `${HEADING} holds no '| Metric | Value |' table` };
  const header = cursor;
  const rows = [];
  let at = cursor + 2; // past the header and the `| --- | --- |` separator
  while (at < lines.length && /^\|/.test(lines[at])) {
    const cells = lines[at].split('|');
    // `| label | value |` splits to ['', ' label ', ' value ', '']
    if (cells.length !== 4) {
      return { error: `${HEADING} row ${String(at + 1)} is not a two-cell row: '${lines[at]}'` };
    }
    rows.push({ label: cells[1].trim(), value: cells[2].trim(), index: at });
    at += 1;
  }
  return { header, rows, lines };
}

/** Every way the table disagrees with the tree. Empty means it agrees. */
function problemsWith(text) {
  const table = readTable(text);
  if (table.error !== undefined) return [table.error];
  const problems = [];

  const seen = new Map();
  const derived = new Map();
  for (const row of table.rows) {
    let matched;
    for (const spec of ROWS) {
      const match = spec.shape.exec(row.label);
      if (match !== null) {
        matched = { spec, match };
        break;
      }
    }
    if (matched === undefined) {
      problems.push(
        `${HEADING} publishes '${row.label}', which names no derivation this guard performs: ` +
          `${ROWS.map((spec) => spec.hint).join(', ')}`,
      );
      continue;
    }
    if (seen.has(matched.spec.name)) {
      problems.push(`${HEADING} publishes '${matched.spec.name}' twice`);
      continue;
    }
    seen.set(matched.spec.name, row);
    let expected;
    try {
      expected = matched.spec.derive(matched.match);
    } catch (error) {
      problems.push(`${HEADING} '${matched.spec.name}': ${error.message}`);
      continue;
    }
    if (typeof expected === 'object' && expected !== null && expected.error !== undefined) {
      problems.push(`${HEADING} '${matched.spec.name}': ${expected.error}`);
      continue;
    }
    derived.set(matched.spec.name, expected);
    if (expected !== row.value) {
      problems.push(
        `${HEADING} says '${row.value}' for ${matched.spec.name}; the tree says '${expected}'`,
      );
    }
  }

  for (const spec of ROWS) {
    if (!seen.has(spec.name)) {
      problems.push(
        `${HEADING} publishes no '${spec.hint}' row: a measurement deleted from the table is a ` +
          'measurement a reader no longer gets, and this guard cannot tell that apart from one that ' +
          'was deleted to silence it',
      );
    }
  }
  return problems;
}

/** Replace every value cell with the derived one, leaving the rest of the file byte-identical. */
function rewrite(text) {
  const table = readTable(text);
  if (table.error !== undefined) throw new Error(table.error);
  const lines = table.lines.slice();
  for (const row of table.rows) {
    for (const spec of ROWS) {
      const match = spec.shape.exec(row.label);
      if (match === null) continue;
      const expected = spec.derive(match);
      if (typeof expected === 'object' && expected !== null && expected.error !== undefined) {
        throw new Error(`${spec.name}: ${expected.error}`);
      }
      lines[row.index] = `| ${row.label} | ${expected} |`;
    }
  }
  return lines.join('\n');
}

function check() {
  for (const [what, path] of [
    ['document', PROGRESS],
    ['suite measurement', SNAPSHOT],
  ]) {
    if (!existsSync(path)) {
      // A missing input is a refusal and not a zero: a table compared against nothing
      // would report every row as wrong, and the message would blame the table.
      console.error(`  - there is no ${what} at ${path}`);
      console.error('check-repository-table: FAILED');
      return 1;
    }
  }
  const text = readFileSync(PROGRESS, 'utf8');
  const writing = process.argv.includes('--write');
  if (writing) {
    // A rewrite that cannot proceed is a refusal with a sentence, not a stack trace. The
    // two ways it fails -- a document with no table to rewrite, and a table whose dated
    // revision does not resolve -- are both states a reader can act on, and a trace would
    // bury the one line that says which.
    //
    // And one way the *measurement* fails, which is not about the document at all: every
    // file row is cut from `git ls-files`, so a file that exists and is not staged is a file
    // the numbers do not count. Measured, at v3.83: a round added one test file, ran
    // `--write` before `git add`, published `Tracked files 638`, committed, and the next
    // check read `639` -- a number that was wrong the moment it was written and that nothing
    // could have caught, because deriving and publishing happened in one mode and the
    // contradiction arrived in the next. The repair is to refuse while the index disagrees
    // with the worktree, because "the tree it was just rewritten from" has to be the tree the
    // commit will contain.
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\u0000')
      .filter((path) => path !== '');
    if (untracked.length > 0) {
      console.error(
        `  - ${String(untracked.length)} file(s) exist and are not tracked (first: ${untracked[0]}), so ` +
          'the counts this rewrite would publish are counts of a tree the commit will contradict; ' +
          'stage them first (`git add -A`) or remove them',
      );
      console.error('check-repository-table: FAILED');
      return 1;
    }
    let rewritten;
    try {
      rewritten = rewrite(text);
    } catch (error) {
      console.error(`  - ${error.message}`);
      console.error('check-repository-table: FAILED');
      return 1;
    }
    if (rewritten !== text) writeFileSync(PROGRESS, rewritten);
  }
  const reread = writing ? readFileSync(PROGRESS, 'utf8') : text;
  const problems = problemsWith(reread);
  // The success line is printed first and the failure line last, which is not layout: the
  // inventory fingerprints a failure site by the nearest diagnostic printed above it, so a
  // gate whose failure branch comes *after* its success branch has its success line recorded
  // as the thing it says when it fails. This draft did exactly that, and the deriver wrote
  // `check-repository-table: OK ...` into the inventory as the diagnostic of a site that only
  // executes when the table is wrong.
  if (problems.length === 0) {
    const table = readTable(reread);
    console.log(
      `check-repository-table: OK (${String(table.rows.length)} row(s) under ${HEADING}, every one ` +
        `derived from ${writing ? 'the tree it was just rewritten from' : 'the tree'}: ` +
        `${table.rows.map((row) => `${row.label} = ${row.value}`).join(', ')})`,
    );
    return 0;
  }
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('check-repository-table: FAILED');
  return 1;
}

// A literal `process.exit(1)` rather than `process.exit(check())`, because
// `derive-gate-sites.mjs` attributes a failure site to a literal exit beside its
// diagnostic; the same shape as every other gate in this directory.
if (check() !== 0) {
  process.exit(1);
}
