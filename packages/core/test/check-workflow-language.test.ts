import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  WORKFLOW_EXTENSIONS,
  check,
  headerOf,
  scanYamlComments,
  workflowsIn,
} from '../../../scripts/yaml-language.mjs';

/**
 * The workflow files are commented in English too, and this is the reader that says so.
 *
 * `check-comments-language.mjs` reads every `.ts`, `.mts`, `.cts`, `.mjs`, `.cjs` and `.js`
 * file in the tree and states in its own header that it does not read these five: a `#` in
 * YAML is a different grammar, and a reader that treated it as one would be wrong in both
 * directions. So `.github/workflows/` -- 1,215 `#` marks, almost all of them prose about
 * why a step exists, which step a budget was raised for, and which run a number came from
 * -- was the one prose surface in the repository with no reader at all.
 *
 * ## What the fixtures are for
 *
 * The entry on the Open list named three shapes and this file holds them plus the ones the
 * scanner's own state can get wrong:
 *
 *   1. a `#` inside a quoted scalar -- `name: 'a # b'` is one value, and the text after the
 *      `#` is not a comment;
 *   2. a `#` inside a `run: |` block that is a shell comment -- this one *is* a comment, in
 *      the language the block holds, and a reader that treated the whole block as opaque
 *      would have missed the majority of the tree's prose;
 *   3. a block scalar whose content contains a quote -- `echo "# not a comment"` must not
 *      leave the reader inside a flow scalar, or every row after it is text;
 *   4. a `#` glued to a word -- `foo#bar` is a scalar, not a comment;
 *   5. a comment row indented deeper than the block's first row -- the shape that was
 *      counted as content the first time this scanner ran.
 *
 * The threshold and the code-span rule are imported rather than copied: `hanInComment` is
 * the function the source reader uses, and it takes `HAN_RUN` and `withoutCodeSpans` from
 * the document reader. Three readers, one definition of what a citation is.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-workflow-language.mjs'];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-workflow-language.mjs');
const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-workflow-language-'));

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** A YAML tree, keyed by relative path. */
function treeOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(SCRATCH, 't-'));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

function run(root: string): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RCA_WORKFLOWS_ROOT: root },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/**
 * The budget both suites in this file are given, in milliseconds.
 *
 * Sixteen of the nineteen tests spawn `check-workflow-language.mjs` over a throwaway tree,
 * and the three that read the real tree walk six files -- so this file's cost is process
 * starts plus a small directory walk, the population `scripts/check-test-budgets.mjs`
 * measured at 5x to 27x between a run alone and a run under four workers. The slowest test
 * here is **READING_MS** alone; 30 000 ms is the estate's tightest declaration for a file
 * that spawns, and the gate holds a declared file to half of it.
 */
const SUITE_BUDGET_MS = 30_000;

/** A run of Han characters, built rather than typed, so a fixture reads as one thing. */
const HAN = (count: number) => '\u672c\u6bb5\u8bf4\u660e\u53ea\u8bb0\u5f55\u5b9e\u6d4b\u503c'.slice(0, count);

describe('the language of a workflow comment', { timeout: SUITE_BUDGET_MS }, () => {
  it('passes an English workflow and says how many comments it read', () => {
    const dir = treeOf({
      '.github/workflows/ci.yml':
        '# One line.\nname: CI\non: push\n# Another.\njobs:\n  a:\n    steps:\n      - run: |\n          # A shell comment.\n          echo one\n',
    });
    const { status, out } = run(dir);
    expect(out).toContain(
      "check-workflow-language: OK — 1 file(s), 3 '#' mark(s): 3 comment(s) (2 line, 1 block scalar)",
    );
    expect(out).toContain('0 run(s) of Han prose');
    expect(status).toBe(0);
  });

  it('refuses a workflow comment of Han prose, naming the row and the run', () => {
    const dir = treeOf({ 'a.yml': `name: CI\n# ${HAN(9)}\non: push\n` });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:2:');
    expect(out).toContain('9 Han character(s) of prose');
    expect(out).toContain("this repository's comments are written in English");
    expect(out).toContain('FAILED');
    expect(status).toBe(1);
  });

  it('does not read a `#` inside a quoted scalar as a comment', () => {
    // The first fixture the Open list named. `'a # b'` is one scalar, and a reader without
    // quote state reports the rest of it as prose.
    const dir = treeOf({ 'a.yml': `name: 'a # ${HAN(9)}'\non: push\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 comment(s)');
    expect(out).toContain('0 run(s) of Han prose');
    expect(out).toContain('1 inside a quoted scalar');
    expect(status).toBe(0);
  });

  it('reads a `#` inside a `run: |` block as a shell comment', () => {
    // The second fixture: this one *is* a comment -- in the language the block holds --
    // and a reader that treated the whole block as opaque would miss the tree's prose.
    const dir = treeOf({
      'a.yml': `jobs:\n  a:\n    steps:\n      - run: |\n          # ${HAN(9)}\n          echo one\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:5:');
    expect(out).toContain('9 Han character(s) of prose');
    expect(status).toBe(1);
  });

  it('does not let a quote inside a block scalar swallow the rows after it', () => {
    // The third fixture. `echo "# not a comment"` holds an even number of quotes, so a
    // reader that opened a flow scalar at the first one would close it at the second and
    // then open another at the third -- and the comment on the next row would be text.
    const dir = treeOf({
      'a.yml': `jobs:\n  a:\n    steps:\n      - run: |\n          echo "# not a comment"\n          # ${HAN(9)}\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:6:');
    expect(out).toContain('9 Han character(s) of prose');
    expect(out).toContain('1 inside a block scalar');
    expect(status).toBe(1);
  });

  it('does not read a `#` glued to a word as a comment', () => {
    const dir = treeOf({ 'a.yml': `name: a#${HAN(9)}\non: push\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 comment(s)');
    expect(out).toContain('1 glued to a word');
    expect(status).toBe(0);
  });

  it('does not open a flow scalar at an apostrophe glued to a word', () => {
    // The real shape: `- name: Build (the round trip reads core's dist)` is a plain scalar
    // with an apostrophe in it, and it is a row of `anchor-roundtrip.yml`. A reader that
    // opened a scalar at every quote would take the rest of the row -- including the
    // comment after it -- as text, and nothing would report the prose in it.
    const dir = treeOf({ 'a.yml': `- name: the runner's cache  # ${HAN(9)}\n` });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:1:');
    expect(out).toContain('9 Han character(s) of prose');
    expect(out).not.toContain('never closes');
    expect(status).toBe(1);
  });

  it('measures a block comment from its own indentation, not from the block first row', () => {
    // The shape the first run of this scanner got wrong: a comment inside a shell `if`, four
    // columns deeper than the block's first row, was counted as content and read by nothing.
    const dir = treeOf({
      'a.yml':
        'jobs:\n  a:\n    steps:\n      - run: |\n          if true; then\n            # ' +
        `${HAN(9)}\n          fi\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:6:');
    expect(out).toContain('9 Han character(s) of prose');
    expect(status).toBe(1);
  });

  it('ends a block scalar at the first row that is indented less', () => {
    // The other half of the same decision: a reader that never ended the block would read
    // the rest of the file as content, and the comment below would be one more shell row.
    const dir = treeOf({
      'a.yml': `jobs:\n  a:\n    steps:\n      - run: |\n          echo one\n  # ${HAN(9)}\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:6:');
    expect(out).toContain('9 Han character(s) of prose');
    // One comment, and it is a YAML comment rather than a shell one: had the block run on,
    // this row would have been counted as a block scalar's own row instead.
    expect(out).toContain('1 comment(s) (1 line, 0 block scalar)');
    expect(status).toBe(1);
  });

  it('reads a comment on the row that opens a block scalar', () => {
    // `run: |  # why` is YAML's own comment on the header, not the block's first row.
    const dir = treeOf({
      'a.yml': `jobs:\n  a:\n    steps:\n      - run: |  # ${HAN(9)}\n          echo one\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:4:');
    expect(out).toContain('9 Han character(s) of prose');
    expect(status).toBe(1);
  });

  it('honours an explicit indentation indicator', () => {
    // `|2` says "two columns past the parent", and the parent is the row the header sits
    // on -- so the block starts at column two, and a comment there is a comment.
    const dir = treeOf({ 'a.yml': `x: |2\n  # ${HAN(9)}\n` });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:2:');
    expect(status).toBe(1);
    expect(headerOf('x: |2')).toEqual({ indent: 2 });
    expect(headerOf('  y: |-')).toEqual({ indent: null });
  });

  it('keeps a block scalar open across a blank row', () => {
    // A blank row is content rather than a boundary; a reader that ended the block there
    // would read the next row as YAML and lose the comment entirely if it were indented.
    const dir = treeOf({ 'a.yml': `x: |\n  echo one\n\n  # ${HAN(9)}\n` });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:4:');
    expect(status).toBe(1);
  });

  it('treats a `|` in the middle of a scalar as a character, not a header', () => {
    // The header pattern requires the indicator to end the row, which is what keeps
    // `echo a | b` and `name: a | b` out of the block branch.
    expect(headerOf('run: echo a | b')).toBeNull();
    expect(headerOf('name: a | b')).toBeNull();
    expect(headerOf('# run: |')).toBeNull();
    expect(headerOf("quoted: 'x |'")).toBeNull();
    expect(headerOf('steps:')).toBeNull();
  });

  it('closes a single-quoted scalar at the doubled quote, not at the first', () => {
    // `''` is YAML's escape, so `'it''s # …'` ends after the sixth character and the `#`
    // after it is text rather than the start of a comment.
    const dir = treeOf({ 'a.yml': `name: 'it''s # ${HAN(9)}'\non: push\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 comment(s)');
    expect(out).toContain('1 inside a quoted scalar');
    expect(status).toBe(0);
  });

  it('refuses a quoted scalar that never closes, rather than guessing who owns the rows after it', () => {
    const dir = treeOf({ 'a.yml': `name: "a\n# ${HAN(9)}\n` });
    const { status, out } = run(dir);
    expect(out).toContain('opens a double-quoted scalar that never closes');
    expect(out).toContain('refused rather than counted as a file with nothing to say');
    expect(status).toBe(1);
  });

  it('refuses a tree with no YAML file, rather than reporting that none is Chinese', () => {
    const dir = treeOf({ 'notes.md': '# not a workflow\n' });
    const { status, out } = run(dir);
    expect(out).toContain('no YAML file under');
    expect(out).toContain('reads exactly like one that passed');
    expect(status).toBe(1);
  });

  it('reads both spellings, and leaves the lock file to the package manager', () => {
    const dir = treeOf({
      'a.yml': '# One.\n',
      'b.yaml': '# Two.\n',
      'pnpm-lock.yaml': '# This file is automatically generated\n',
      'notes.md': '# no\n',
    });
    expect(workflowsIn(dir)).toEqual(['a.yml', 'b.yaml']);
    expect([...WORKFLOW_EXTENSIONS].sort()).toEqual(['.yaml', '.yml']);
  });

  it('finds workflows in subdirectories, so the scope is the tree rather than the top level', () => {
    const dir = treeOf({
      '.github/workflows/ci.yml': 'name: CI\n',
      'deep/nested/x.yaml': 'name: X\n',
      'dist/built.yml': 'name: built\n',
    });
    expect(workflowsIn(dir)).toEqual(['.github/workflows/ci.yml', 'deep/nested/x.yaml']);
  });
});

describe('the reading, at its edges', { timeout: SUITE_BUDGET_MS }, () => {
  it('classifies every `#` into exactly one bucket, and the buckets add up', () => {
    // The census, as one fixture that exercises all four buckets at once: a comment row, a
    // `#` inside a quoted scalar, a `#` inside a block scalar's row, and a `#` glued to a
    // word. A `#` that is crossed without being classified is a region nobody walked.
    const text = [
      '# a comment',
      "name: 'a # in a quote'",
      'jobs:',
      '  a:',
      '    steps:',
      '      - run: |',
      '          echo "a # in a shell string"',
      '          # a shell comment',
      'plain: glue#here',
      '',
    ].join('\n');
    const found = scanYamlComments(text);
    expect(found.problems).toEqual([]);
    expect(found.hashes).toEqual({ comment: 2, quoted: 1, blockRow: 1, scalar: 1 });
    expect(found.comments).toEqual([
      { kind: 'line', family: '#0', line: 1, text: ' a comment' },
      { kind: 'block', family: '#10', line: 8, text: ' a shell comment' },
    ]);
    // The family is the `#` and its column, and it is what decides whether two rows can be
    // one paragraph: the block scalar's row sits at column ten, so it cannot continue the
    // row at column zero even if the two were adjacent.
    expect(found.comments.map((comment) => comment.family)).toEqual(['#0', '#10']);
    const total = Object.values(found.hashes).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(text.split('#').length - 1);
  });

  it('counts a second `#` on a comment row as part of that comment', () => {
    // `# see #3` is two marks and one comment: a census that counted the mark twice as an
    // opener would report a row nobody can open.
    const found = scanYamlComments('# see #3\n');
    expect(found.hashes).toEqual({ comment: 2, quoted: 0, blockRow: 0, scalar: 0 });
    expect(found.comments).toEqual([{ kind: 'line', family: '#0', line: 1, text: ' see #3' }]);
  });

  it('reports a run at the row it sits on, and only outside a code span', () => {
    expect(scanYamlComments(`# \`${HAN(9)}\`\n`).comments).toHaveLength(1);
    const dir = treeOf({ 'a.yml': `# See \`${HAN(9)}\`.\n` });
    expect(run(dir).status).toBe(0);
    expect(run(treeOf({ 'a.yml': `# ${HAN(7)}.\n` })).status).toBe(0);
    expect(run(treeOf({ 'a.yml': `# ${HAN(8)}.\n` })).status).toBe(1);
  });

  it('reports the tree it was given, and the real tree is clean', () => {
    const real = check(ROOT);
    expect(real.ok).toBe(true);
    expect(real.files).toBe(6);
    expect(real.comments).toBeGreaterThan(1_000);
    expect(real.marks).toBeGreaterThan(1_200);
    expect(real.runs).toBe(0);
    expect(real.hashes.quoted).toBe(0);
    expect(real.hashes.scalar).toBe(0);
    expect(real.summary).toContain('0 run(s) of Han prose');
  });

  it('agrees with a row-based predicate on every `#` row in the tree', () => {
    // The scanner and a predicate that knows nothing about quotes or block scalars are
    // different instruments, so their agreement on the real tree is evidence rather than a
    // tautology: every row whose first non-blank character is a `#` must be recorded as a
    // comment on that row.
    //
    // The predicate has shapes that would make it wrong rather than the scanner: a `#` row
    // inside a flow scalar that spans rows, and a `#` row inside a block scalar that a
    // reader mistook for YAML. Neither occurs in this tree. If one ever does, the repair is
    // a named exemption with a reason -- not deleting this assertion, which is the only
    // thing that would notice a scanner that stopped recording what it read.
    const lost: string[] = [];
    let rows = 0;
    for (const name of workflowsIn(ROOT)) {
      const text = readFileSync(join(ROOT, name), 'utf8');
      const { comments } = scanYamlComments(text);
      const recorded = new Set(comments.map((comment) => comment.line));
      text.split('\n').forEach((raw, index) => {
        if (!/^[ \t]*#/.test(raw)) return;
        rows += 1;
        if (!recorded.has(index + 1)) lost.push(`${name}:${String(index + 1)}`);
      });
    }
    expect(lost).toEqual([]);
    expect(rows).toBeGreaterThan(1_100);
    expect(check(ROOT).comments).toBe(rows);
  });
});

/**
 * A row break inside a `#` comment paragraph -- the third surface of one boundary.
 *
 * The workflow files are where this repository writes down *why* a step exists, in prose,
 * and prose wrapped in a narrow column is two rows. The census counts comments row by row
 * on purpose (a row beginning with `#` must be a comment on that row), so the language
 * rule has to group those rows itself rather than let the census decide what a paragraph
 * is -- two answers to two different questions, which is why both are checked.
 */
describe('a row break inside a workflow comment', { timeout: SUITE_BUDGET_MS }, () => {
  it('crosses the break between two `#` rows on consecutive lines', () => {
    const dir = treeOf({ 'a.yml': `# ${HAN(4)}\n# ${HAN(4)}.\njobs:\n  a: 1\n` });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:1:');
    expect(out).toContain('8 Han character(s) of prose across 2 row(s)');
    expect(status).toBe(1);
  });

  it('does not cross from one column to another', () => {
    const dir = treeOf({ 'a.yml': `# ${HAN(4)}\n  # ${HAN(4)}.\njobs:\n  a: 1\n` });
    expect(run(dir).status).toBe(0);
  });

  it('does not cross a blank row between two `#` comments', () => {
    const dir = treeOf({ 'a.yml': `# ${HAN(4)}\n\n# ${HAN(4)}.\njobs:\n  a: 1\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 run(s)');
    expect(status).toBe(0);
  });

  it('crosses the break between two comment rows inside a block scalar', () => {
    // Both rows are comments the census reads from a `run: |` block, and the language rule
    // pairs them the same way it pairs any other two rows: adjacency is all it asks.
    const dir = treeOf({
      'a.yml': `jobs:\n  a:\n    steps:\n      - run: |\n          echo hi\n          # ${HAN(4)}\n          # ${HAN(4)}.\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('a.yml:6:');
    expect(out).toContain('across 2 row(s)');
    expect(status).toBe(1);
  });

  it('reports the row breaks it held, and the real tree holds hundreds', () => {
    expect(check(ROOT).pairs).toBeGreaterThan(400);
  });

  it('does not cross a row that ends in a backslash, because there a backslash is text', () => {
    // A workflow comment is a YAML comment and YAML has no renderer, so the trailing
    // backslash is a character: `# …\` above `# …` is two rows with a backslash between
    // them, not a hard break. Same bytes as the markdown fixture that must be red.
    const dir = treeOf({ 'a.yml': `# ${HAN(4)}\\\n# ${HAN(4)}.\njobs:\n  a: 1\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 run(s)');
    expect(status).toBe(0);
  });
});
