import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { hanInComment } from '../../../scripts/docs-language.mjs';
import {
  SOURCE_EXTENSIONS,
  check,
  scanComments,
  sourcesIn,
} from '../../../scripts/comment-language.mjs';

/**
 * The comments of this repository are English, and this is the reader that says so.
 *
 * `check-docs-language.mjs` reads markdown and nothing else: `src/`, `scripts/` and the
 * tests were, until this file, reviewed by reviewers. The ask on the Open list was "give
 * the comment body a reader (needs a lexer)", and the parenthetical is the whole reason
 * this took three rounds to reach -- a comment is not a line that starts with `//`, it is
 * a region a scanner has to establish, and a scanner that is wrong prints a sentence about
 * a subject that is not there. That is finding 545's shape (a true clause about a
 * comparison that never happened) and finding 547's (a true clause about a window no row
 * can fall in), one instrument over.
 *
 * ## What the fixtures are for
 *
 * Every way a naive reader invents a comment gets a fixture that *would* be reported if
 * the reader kept the shortcut:
 *
 *   1. a `//` inside a string -- `'https://...'` is on nearly every line of `scripts/`,
 *      and the text after it is not a comment;
 *   2. a `/*` inside a regex -- a reader that has no regex state opens a block comment
 *      that never closes and reports a file it could not read, on a file that is fine;
 *   3. a template literal -- a SQL query with `//` in it is text, and the `${}` inside it
 *      is code again, with comments of its own;
 *   4. a shebang -- `#!/usr/bin/env node` opens with `/`, and a reader whose only regex
 *      question is "can a regex start here" answers yes at offset 2.
 *
 * The three exclusions are shared with the document reader rather than copied: `HAN_RUN`
 * and `withoutCodeSpans` are imported from it, so "a run of eight" and "a code span is a
 * citation" are one decision applied to two subjects. A second copy is the
 * third-source-of-truth defect `validity.test.ts` names, and this file could not catch it.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-comments-language.mjs'];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-comments-language.mjs');
const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-comments-language-'));

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** A source tree, keyed by relative path. */
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
    env: { ...process.env, RCA_COMMENTS_ROOT: root },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/**
 * The budget both suites in this file are given, in milliseconds.
 *
 * Fourteen of the eighteen tests spawn `check-comments-language.mjs` over a throwaway
 * tree, and the two that read the real tree walk 462 files -- so this file's cost is
 * process starts plus a directory walk, the population `scripts/check-test-budgets.mjs`
 * measured at 5x to 27x between a run alone and a run under four workers. The slowest
 * test here is **413 ms** alone; 30 000 ms is the estate's tightest declaration for a
 * file that spawns, as for `check-cli-reference.test.ts` and `gen-examples.test.ts`, and
 * the gate holds a declared file to half of it.
 */
const SUITE_BUDGET_MS = 30_000;

/** A run of Han characters, built rather than typed, so a fixture reads as one thing. */
const HAN = (count: number) => '\u672c\u6bb5\u8bf4\u660e\u53ea\u8bb0\u5f55\u5b9e\u6d4b\u503c'.slice(0, count);

describe('the language of a comment', { timeout: SUITE_BUDGET_MS }, () => {
  it('passes an English tree and says how many comments it read', () => {
    const dir = treeOf({
      'src/a.ts': '// One line.\nconst a = 1;\n/**\n * A block.\n */\nconst b = 2;\n',
      'scripts/tool.mjs': '#!/usr/bin/env node\nexport const c = 3;\n',
    });
    const { status, out } = run(dir);
    expect(out).toContain('check-comments-language: OK — 2 file(s), 2 comment(s) (1 line, 1 block)');
    expect(out).toContain('0 run(s) of Han prose');
    expect(status).toBe(0);
  });

  it('refuses a comment of Han prose, naming the line and the run', () => {
    const dir = treeOf({ 'src/a.ts': `const a = 1;\n// ${HAN(8)}${HAN(8)}.\n` });
    const { status, out } = run(dir);
    expect(out).toContain('src/a.ts:2:');
    expect(out).toContain('16 Han character(s) of prose');
    expect(out).toContain("this repository's comments are written in English");
    expect(out).toContain('FAILED');
    expect(status).toBe(1);
  });

  it('does not read a `//` inside a string as a comment', () => {
    // The line a reader without string state gets wrong: every URL in `scripts/` looks
    // like a comment start at offset seven.
    const url = run(treeOf({ 'src/a.ts': `const url = 'https://${HAN(8)}.example/path';\n` }));
    expect(url.out).toContain('1 file(s)');
    expect(url.out).toContain('0 comment(s)');
    expect(url.out).toContain('0 run(s)');
    expect(url.out).toContain('1 comment opener(s) skipped inside a string');
    expect(url.status).toBe(0);
  });

  it('does not let a `/*` inside a regex swallow the rest of the file', () => {
    // `/x\/*/` holds the two characters that open a block comment. A reader with no regex
    // state reports "opens at line 1 and never closes" on a file whose next line is the
    // comment it was asked to read.
    const dir = treeOf({
      'src/a.ts': `const re = /x\\/*/;\n// ${HAN(8)}${HAN(8)}\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('src/a.ts:2:');
    expect(out).toContain('16 Han character(s) of prose');
    expect(out).not.toContain('never closes');
    expect(status).toBe(1);
  });

  it('does not read a division as the start of a regex', () => {
    // The other direction of the same state: a reader that answers "a regex can start
    // here" unconditionally consumes `2; // …` as a pattern and loses the comment.
    const dir = treeOf({ 'src/a.ts': `const half = total / 2; // ${HAN(9)}\n` });
    const { status, out } = run(dir);
    expect(out).toContain('src/a.ts:1:');
    expect(status).toBe(1);
  });

  it('reads a template literal as text, and its interpolation as code', () => {
    const text = run(treeOf({ 'src/a.ts': `const q = \`SELECT 1 // ${HAN(9)}\`;\n` }));
    expect(text.out).toContain('0 comment(s)');
    expect(text.status).toBe(0);

    const code = run(
      treeOf({ 'src/a.ts': `const q = \`SELECT \${\n  // ${HAN(9)}\n  1}\`;\n` }),
    );
    expect(code.out).toContain('src/a.ts:2:');
    expect(code.status).toBe(1);
  });

  it('reads a code span inside a comment as a citation', () => {
    // The real shape: `src/gates/validity.ts` cites a Chinese file name and
    // `src/gates/gates.ts` quotes a Chinese query, both inside backticks.
    const dir = treeOf({ 'src/a.ts': `// See \`${HAN(9)}\` and \`${HAN(9)}\`.\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 run(s)');
    expect(status).toBe(0);
  });

  it('counts seven characters as a citation and eight as prose', () => {
    expect(run(treeOf({ 'src/a.ts': `// ${HAN(7)}.\n` })).status).toBe(0);
    expect(run(treeOf({ 'src/a.ts': `// ${HAN(8)}.\n` })).status).toBe(1);
  });

  it('refuses a file whose block comment never closes, rather than skipping the file', () => {
    // A file the reader cannot read is not a file with no comments: skipping it would make
    // the census a statement about the files that happened to parse.
    const dir = treeOf({ 'src/a.ts': `const a = 1;\n/* ${HAN(9)}\n` });
    const { status, out } = run(dir);
    expect(out).toContain('src/a.ts:2:');
    expect(out).toContain('opens a block comment that never closes');
    expect(out).toContain('FAILED');
    expect(status).toBe(1);
  });

  it('refuses a tree with no source file, rather than reporting that none is Chinese', () => {
    const dir = treeOf({ 'notes.md': '# not a source file\n' });
    const { status, out } = run(dir);
    expect(out).toContain('no TypeScript or JavaScript file under');
    expect(out).toContain('reads exactly like one that passed');
    expect(status).toBe(1);
  });

  it('finds sources in subdirectories, so the scope is the tree rather than the top level', () => {
    const dir = treeOf({
      'a/b/c/deep.ts': '// Deep.\n',
      'top.mjs': '// Top.\n',
      'notes.md': '# no\n',
      'dist/built.js': '// built\n',
    });
    expect(sourcesIn(dir)).toEqual(['a/b/c/deep.ts', 'top.mjs']);
  });
});

describe('the reading, at its edges', { timeout: SUITE_BUDGET_MS }, () => {
  it('states the extensions it reads, and reads each of them', () => {
    expect([...SOURCE_EXTENSIONS].sort()).toEqual(['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts']);
    const dir = treeOf(
      Object.fromEntries([...SOURCE_EXTENSIONS].map((ext) => [`a${ext}`, `// ${HAN(9)}\n`])),
    );
    const result = check(dir);
    expect(result.files).toBe(SOURCE_EXTENSIONS.length);
    expect(result.runs).toBe(SOURCE_EXTENSIONS.length);
  });

  it('reports a block comment at the line the run sits on, not at its opener', () => {
    const found = scanComments('/**\n * One.\n * Two.\n * Three.\n */\n');
    expect(found.problem).toBeNull();
    expect(found.comments).toEqual([{ kind: 'block', line: 1, text: '*\n * One.\n * Two.\n * Three.\n ' }]);
    expect(hanInComment({ kind: 'block', line: 1, text: '\nOne.\nTwo.\n' + HAN(9) })).toEqual([
      { line: 4, text: HAN(9), length: 9 },
    ]);
  });

  it('strips the decoration a block comment puts on each line', () => {
    const dir = treeOf({ 'src/a.ts': `/*\n * ${HAN(9)}\n */\n` });
    const { status } = run(dir);
    expect(status).toBe(1);
  });

  it('does not read a shebang as a regex, and does not count it as a comment', () => {
    const found = scanComments('#!/usr/bin/env node\n// One.\n');
    expect(found.comments).toEqual([{ kind: 'line', line: 2, text: ' One.' }]);
  });

  it('reports the tree it was given, and the real tree is clean', () => {
    const real = check(ROOT);
    expect(real.ok).toBe(true);
    expect(real.files).toBeGreaterThan(400);
    expect(real.comments).toBeGreaterThan(20_000);
    expect(real.runs).toBe(0);
    expect(real.markers).toBeGreaterThan(100);
    expect(real.summary).toContain('0 run(s) of Han prose');
  });

  it('agrees with a line-based predicate on every opener in the tree', () => {
    // The scanner and a predicate that knows nothing about strings are different
    // instruments, so their agreement on the real tree is evidence and not a tautology:
    // every line whose first characters are `//` must be recorded as a comment on that
    // line, and the same for `/*`.
    //
    // The predicate has two shapes that would make it wrong rather than the scanner: a
    // template literal with a line that starts `//` (a SQL fragment), and a line inside a
    // block comment that starts `//`. Neither occurs in this tree. If one ever does, the
    // repair is a named exemption with a reason -- not deleting this assertion, which is
    // the only thing that would notice a scanner that stopped recording what it read.
    const lost: string[] = [];
    let lineOpeners = 0;
    let blockOpeners = 0;
    for (const name of sourcesIn(ROOT)) {
      const text = readFileSync(join(ROOT, name), 'utf8');
      const { comments } = scanComments(text);
      const lineStarts = new Set(comments.filter((c) => c.kind === 'line').map((c) => c.line));
      const blockStarts = new Set(comments.filter((c) => c.kind === 'block').map((c) => c.line));
      text.split('\n').forEach((raw, index) => {
        const trimmed = raw.trimStart();
        if (trimmed.startsWith('//')) {
          lineOpeners += 1;
          if (!lineStarts.has(index + 1)) lost.push(`${name}:${String(index + 1)}: //`);
        }
        if (trimmed.startsWith('/*')) {
          blockOpeners += 1;
          if (!blockStarts.has(index + 1)) lost.push(`${name}:${String(index + 1)}: /*`);
        }
      });
    }
    expect(lost).toEqual([]);
    expect(lineOpeners).toBeGreaterThan(19_000);
    expect(blockOpeners).toBeGreaterThan(3_000);
  });

  it('reads the six real files that carry Han, and calls every one of them a citation', () => {
    // These are the only source files in the tree with Han characters: a file name in a
    // code span, a quoted query, a quoted table cell. If the span rule stopped working,
    // the real tree would be the failure case rather than a fixture.
    for (const name of [
      'packages/core/src/gates/gates.ts',
      'packages/core/src/gates/validity.ts',
      'packages/core/src/ingest/backends.ts',
      'scripts/check-backend-support.mjs',
      'scripts/check-l4-status.mjs',
      'scripts/docs-language.mjs',
    ]) {
      expect(sourcesIn(ROOT)).toContain(name);
      const body = scanComments(readFileSync(join(ROOT, name), 'utf8'));
      expect(body.problem).toBeNull();
      for (const comment of body.comments) expect(hanInComment(comment)).toEqual([]);
    }
  });
});
