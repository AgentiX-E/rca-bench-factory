import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { HAN_RUN, check, documentsIn, hanProseIn, withoutCodeSpans } from '../../../scripts/docs-language.mjs';

/**
 * The documents of this repository are English, and this is the reader that says so.
 *
 * Three rounds of the progress log (v3.69, v3.83, v3.84) were written in Chinese --
 * 43, 40 and 33 lines with their headings -- in a tree whose commit messages, comments
 * and gate output are English. Nothing failed: `docs:check` runs twenty gates over those
 * documents and not one of them asks what language a sentence is in. The rounds were
 * rewritten against the record, and this file is the part that keeps a fourth one from
 * arriving the same way.
 *
 * ## What the fixtures are for
 *
 * The rule has three exclusions (fences, code spans, block quotes) and a threshold
 * (eight characters), and an exclusion with no failure case is indistinguishable from a
 * rule that does not run. So each exclusion gets a fixture that *would* be reported if
 * the exclusion were removed, and the threshold gets one on each side of it. The two
 * shapes that are easiest to get wrong -- a span delimited by two backticks around text
 * that contains one, and an unterminated backtick -- are fixtures too, because both are
 * cases where a regex-based reader is silently wrong in the direction of passing.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-docs-language.mjs'];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-docs-language.mjs');
const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-docs-language-'));

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** A document tree, keyed by relative path. */
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
    env: { ...process.env, RCA_DOCS_ROOT: root },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/** A run of Han characters, built rather than typed, so the fixture reads as one thing. */
const HAN = (count: number) => '\u672c\u6587\u6863\u53ea\u8bb0\u5f55\u5b9e\u6d4b\u503c'.slice(0, count);

describe('the language of a document', { timeout: 30_000 }, () => {
  it('passes an English tree and says how many documents it read', () => {
    const dir = treeOf({
      'README.md': '# Title\n\nA sentence of prose, in English, with no Han characters.\n',
      'docs/page.md': '# Page\n\nAnother one.\n',
    });
    const { status, out } = run(dir);
    expect(out).toContain('check-docs-language: OK — 2 document(s), 0 run(s)');
    expect(status).toBe(0);
  });

  it('refuses a paragraph of Han prose, naming the line and the run', () => {
    const dir = treeOf({ 'docs/page.md': `# Page\n\n${HAN(8)}${HAN(8)}.\n` });
    const { status, out } = run(dir);
    expect(out).toContain('docs/page.md:3:');
    expect(out).toContain('16 Han character(s) of prose');
    expect(out).toContain("this repository's documents are written in English");
    expect(out).toContain('FAILED');
    expect(status).toBe(1);
  });

  it('reads a fenced block as a quotation, not as prose', () => {
    // A captured Chinese output is exactly what a round about a Chinese document quotes.
    const dir = treeOf({ 'docs/page.md': `# Page\n\n\`\`\`\n${HAN(8)}${HAN(8)}\n\`\`\`\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 run(s)');
    expect(status).toBe(0);
  });

  it('reads a code span as a citation, including a span whose content holds a backtick', () => {
    // `04-里程碑与路线图.md` is a real citation in this tree; the second is the shape that
    // a single-backtick reader gets wrong, because the inner backtick would end the span
    // early and leave sixteen characters of Han in "prose".
    const dir = treeOf({
      'docs/page.md': `# Page\n\nSee \`04-里程碑与路线图.md\` and \`\`${HAN(8)} \`x\` ${HAN(8)}\`\`.\n`,
    });
    const { status, out } = run(dir);
    expect(out).toContain('0 run(s)');
    expect(status).toBe(0);
  });

  it('reads a block quote as another document speaking', () => {
    const dir = treeOf({ 'docs/page.md': `# Page\n\n> ${HAN(8)}${HAN(8)}\n\nBack to English.\n` });
    const { status, out } = run(dir);
    expect(out).toContain('0 run(s)');
    expect(status).toBe(0);
  });

  it('counts seven characters as a citation and eight as prose', () => {
    // The threshold is a decision, so both sides of it are asserted: `金标` is a term this
    // tree quotes from a table, and a sentence is not seven characters long.
    expect(run(treeOf({ 'docs/page.md': `# Page\n\n${HAN(7)}.\n` })).status).toBe(0);
    expect(run(treeOf({ 'docs/page.md': `# Page\n\n${HAN(8)}.\n` })).status).toBe(1);
  });

  it('does not let an unterminated backtick silence the rest of the line', () => {
    // The failure mode of every regex that strips spans: an odd backtick swallows the line,
    // and a line that was refused becomes a line that passes.
    const dir = treeOf({ 'docs/page.md': `# Page\n\n\`oops ${HAN(8)}${HAN(8)}.\n` });
    const { status, out } = run(dir);
    expect(out).toContain('16 Han character(s) of prose');
    expect(status).toBe(1);
  });

  it('refuses a tree with no document, rather than reporting that none is Chinese', () => {
    const dir = treeOf({ 'notes.txt': 'not a document' });
    const { status, out } = run(dir);
    expect(out).toContain('no markdown document under');
    expect(out).toContain('reads exactly like one that passed');
    expect(status).toBe(1);
  });

  it('finds documents in subdirectories, so the scope is the tree rather than the top level', () => {
    const dir = treeOf({ 'a/b/c/deep.md': '# Deep\n', 'top.md': '# Top\n' });
    expect(documentsIn(dir).sort()).toEqual(['a/b/c/deep.md', 'top.md']);
  });
});

describe('the reading, at its edges', () => {
  it('states the threshold it applies, and applies it', () => {
    expect(HAN_RUN.source).toBe('\\p{Script=Han}{8,}');
    expect(hanProseIn(HAN(7)).length).toBe(0);
    expect(hanProseIn(HAN(8)).length).toBe(1);
  });

  it('hands back the line number an editor would show', () => {
    const found = hanProseIn(`# Title\n\n${HAN(8)}\n`);
    expect(found).toEqual([{ line: 3, text: HAN(8), length: 8 }]);
  });

  it('opens and closes a span by delimiter length, and leaves a stray backtick alone', () => {
    expect(withoutCodeSpans('a `b` c')).toBe('a  c');
    expect(withoutCodeSpans('a ``b ` c`` d')).toBe('a  d');
    expect(withoutCodeSpans('a `b c')).toBe('a `b c');
  });

  it('reports the tree it was given, and the real tree is clean', () => {
    const real = check(ROOT);
    expect(real.ok).toBe(true);
    expect(real.documents).toBeGreaterThan(40);
    expect(real.summary).toContain('0 run(s) of Han prose');
  });
});
