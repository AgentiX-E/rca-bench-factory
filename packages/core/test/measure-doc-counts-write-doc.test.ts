import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { rewritePublishedRows } from '../../../scripts/doc-counts-rows.mjs';

/**
 * Writing the published counts into the document a reader opens.
 *
 * ## The defect
 *
 * `doc-counts.json` and the row in `docs/progress.md` were refreshed by hand, in
 * two steps. The guard compares the row against the snapshot, so doing one without
 * the other is green **locally** and red only in CI, at a step a person cannot run
 * without pushing. And the two steps are not equally obvious: the snapshot is
 * written by a command, and the row is a `str.replace` somebody performs on a
 * 7000-line file.
 *
 * ## What can go wrong here, and why every branch refuses
 *
 * A checker that guesses wrong prints a line a person can argue with. A **writer**
 * that guesses wrong edits the record and reports success -- and `progress.md` is
 * the record. So the function refuses rather than picks:
 *
 *  - a current-state row whose label names no scope
 *  - a second current-state row for a scope already rewritten
 *  - a scope with no current-state row at all
 *  - a row in a shape the checker does not read
 *
 * The row that must survive untouched is the **dated** one: `(as of 488d3b1)` is
 * what a past pass measured, and it is supposed to differ from today.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'measure-doc-counts.mjs');

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rca-write-doc-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const COUNTS = {
  core: { files: 161, tests: 3954 },
  cli: { files: 4, tests: 187 },
  repo: { files: 165, tests: 4141 },
};

/** A document with one current table, one dated table, and prose around both. */
const DOC = [
  '# Progress',
  '',
  'Prose that must survive, including the word core and a number like 12 files.',
  '',
  'A sentence that says the current state of something else entirely, with no row',
  'anywhere near it, is not a claim about these counts.',
  '',
  '| change | effect |',
  '| --- | --- |',
  "| `check-doc-counts` | refused the change first: the `as of this commit` rows were dated |",
  '',
  '| gate | result |',
  '| --- | --- |',
  '| `core` test suite | **150 files, 3900 tests passed** (as of `488d3b1`) |',
  '| repo test suite | **154 files, 4087 tests passed** (as of `488d3b1`) |',
  '',
  '## v2.12',
  '',
  '| gate | result |',
  '| --- | --- |',
  '| `core` test suite | **160 files, 3947 tests passed** (as of this commit) |',
  '| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |',
  '| repo test suite | **164 files, 4134 tests passed** (as of this commit) |',
  '',
].join('\n');

describe('rewritePublishedRows', () => {
  it('rewrites the current rows and leaves the dated ones alone', () => {
    const result = rewritePublishedRows(DOC, COUNTS);
    expect(result.errors).toEqual([]);
    expect(result.text).toContain('| `core` test suite | **161 files, 3954 tests passed** (as of this commit) |');
    expect(result.text).toContain('| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |');
    expect(result.text).toContain('| repo test suite | **165 files, 4141 tests passed** (as of this commit) |');
    // The dated record is what a past pass measured. Rewriting it would destroy
    // the only evidence of that pass's numbers.
    expect(result.text).toContain('| `core` test suite | **150 files, 3900 tests passed** (as of `488d3b1`) |');
    expect(result.text).toContain('| repo test suite | **154 files, 4087 tests passed** (as of `488d3b1`) |');
  });

  it('touches nothing but the digits', () => {
    const result = rewritePublishedRows(DOC, COUNTS);
    const before = DOC.split('\n');
    const after = result.text.split('\n');
    expect(after).toHaveLength(before.length);
    const changed = before.filter((line, i) => line !== after[i]);
    // Two, not three: the `cli` row already carries 4 files / 187 tests, so its
    // digits are correct and nothing about the line needs to move. A writer that
    // counted it as "updated" would be reporting a change it did not make.
    expect(changed).toHaveLength(2);
    // The prose line carries "12 files" and must not be rewritten: it names no
    // scope and is not a table row, and a writer that pattern-matched globally
    // would edit a sentence.
    expect(result.text).toContain('Prose that must survive, including the word core and a number like 12 files.');
  });

  it('leaves a row that quotes the phrase alone', () => {
    // Found by the first live run of this function on the shipped document: a
    // change-log table quotes the marker inside a sentence. Its row names no scope
    // and publishes no count, so it is not a claim about these numbers -- and a
    // writer that rewrote it would be editing prose because of a word in it.
    const result = rewritePublishedRows(DOC, COUNTS);
    expect(result.errors).toEqual([]);
    expect(result.text).toContain(
      '| `check-doc-counts` | refused the change first: the `as of this commit` rows were dated |',
    );
  });

  it('is idempotent', () => {
    const once = rewritePublishedRows(DOC, COUNTS).text;
    const twice = rewritePublishedRows(once, COUNTS);
    expect(twice.text).toBe(once);
    expect(twice.rewritten).toEqual([]);
  });

  it('reports which rows it changed, by scope and line', () => {
    const result = rewritePublishedRows(DOC, COUNTS);
    expect(result.rewritten.map((one) => one.scope).sort()).toEqual(['core', 'repo']);
    // Every row was *seen*; only the ones whose digits moved are reported.
    expect(result.text).toContain('| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |');
  });

  it('refuses a current-state row that names no scope', () => {
    const doc = DOC.replace(
      '| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |',
      '| test suite | **4 files, 187 tests passed** (as of this commit) |',
    );
    const result = rewritePublishedRows(doc, COUNTS);
    expect(result.errors.join('\n')).toContain('a current-state row names no scope');
    // And it does not fall back to "write it somewhere": the row is untouched.
    expect(result.text).toContain('| test suite | **4 files, 187 tests passed** (as of this commit) |');
  });

  it('refuses a second current-state row for the same scope', () => {
    const doc = `${DOC}| \`core\` test suite | **1 files, 1 tests passed** (as of this commit) |\n`;
    const result = rewritePublishedRows(doc, COUNTS);
    expect(result.errors.join('\n')).toContain("a second current-state row for 'core'");
    // The duplicate is left with its old numbers rather than being given a second
    // guess at the same fact.
    expect(result.text).toContain('**1 files, 1 tests passed**');
  });

  it('refuses a scope with no current-state row at all', () => {
    const doc = DOC.replace('| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |\n', '');
    const result = rewritePublishedRows(doc, COUNTS);
    expect(result.errors.join('\n')).toContain("no current-state row for 'cli'");
  });

  it('refuses a row in a shape the checker does not read', () => {
    const doc = DOC.replace(
      '| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |',
      '| `cli` test suite | 187 passed (as of this commit) |',
    );
    const result = rewritePublishedRows(doc, COUNTS);
    expect(result.errors.join('\n')).toContain("not in the 'N files, M tests passed' shape");
  });

  it('accepts the other marker wording the checker accepts', () => {
    const doc = DOC.replaceAll('(as of this commit)', '(current state)');
    const result = rewritePublishedRows(doc, COUNTS);
    expect(result.errors).toEqual([]);
    expect(result.text).toContain('| `core` test suite | **161 files, 3954 tests passed** (current state) |');
  });
});

describe('scripts/measure-doc-counts.mjs --write-doc', () => {
  /** One vitest report holding a single passing file under `packageDir`. */
  function report(packageDir: string, name: string, assertions: number): string {
    const path = join(scratch(), `${name}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        testResults: [
          {
            name: join(ROOT, 'packages', packageDir, 'test', `${name}.test.ts`),
            status: 'passed',
            assertionResults: Array.from({ length: assertions }, () => ({ status: 'passed' })),
          },
        ],
      }),
    );
    return path;
  }

  it('writes the snapshot and the document in one run, from one measurement', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const out = join(dir, 'doc-counts.json');
    writeFileSync(doc, DOC);

    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--write-doc',
        '--doc',
        doc,
        '--out',
        out,
        '--from',
        `${report('core', 'alpha', 7)},${report('cli', 'beta', 3)}`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    // The measurement is what the two reports describe: core 1 file / 7 tests,
    // cli 1 file / 3 tests, repo the sum.
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({
      core: { files: 1, tests: 7 },
      cli: { files: 1, tests: 3 },
      repo: { files: 2, tests: 10 },
    });
    expect(readFileSync(doc, 'utf8')).toContain('| `core` test suite | **1 files, 7 tests passed** (as of this commit) |');
    expect(readFileSync(doc, 'utf8')).toContain('| repo test suite | **2 files, 10 tests passed** (as of this commit) |');
    expect(result.stdout).toContain('3 row(s) updated');
  });

  it('refuses to run while also checking, because the two verdicts contradict', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--check', '--write-doc'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contradict each other');
  });

  it('writes neither file when the report it was given describes a red run', () => {
    // A writer that publishes the passing half of a red run would put a number in
    // the record that no run ever printed, and the next green run would look like
    // a jump. The refusal has to come before the first write, not between them.
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const out = join(dir, 'doc-counts.json');
    writeFileSync(doc, DOC);
    writeFileSync(out, '{"original":true}\n');

    const red = join(dir, 'red.json');
    writeFileSync(
      red,
      JSON.stringify({
        testResults: [
          {
            name: join(ROOT, 'packages', 'core', 'test', 'epsilon.test.ts'),
            status: 'failed',
            assertionResults: [{ status: 'passed' }, { status: 'failed' }],
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--write-doc',
        '--doc',
        doc,
        '--out',
        out,
        '--from',
        `${red},${report('cli', 'zeta', 1)}`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('records a failure, so it is not a measurement');
    expect(result.stderr).toContain('epsilon.test.ts');
    expect(result.stderr).not.toContain('row(s) updated');
    expect(readFileSync(out, 'utf8')).toBe('{"original":true}\n');
    expect(readFileSync(doc, 'utf8')).toBe(DOC);
  });

  it('writes neither file when the document cannot be rewritten', () => {
    // The half-state this flag exists to remove: a snapshot that moved and a
    // document that did not. Neither is written unless both can be.
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const out = join(dir, 'doc-counts.json');
    writeFileSync(doc, '# no rows at all\n');
    writeFileSync(out, '{"original":true}\n');

    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--write-doc',
        '--doc',
        doc,
        '--out',
        out,
        '--from',
        `${report('core', 'gamma', 2)},${report('cli', 'delta', 1)}`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nothing was written');
    expect(result.stderr).toContain("no current-state row for 'core'");
    expect(readFileSync(out, 'utf8')).toBe('{"original":true}\n');
    expect(readFileSync(doc, 'utf8')).toBe('# no rows at all\n');
  });
});
