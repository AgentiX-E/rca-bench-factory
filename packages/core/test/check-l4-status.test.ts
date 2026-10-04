import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/check-l4-status.mjs` -- the guard that holds the published L4 table
 * to the asset registry.
 *
 * The failure this guard exists for is recorded as finding 112. The published
 * per-format table carried a single cell for the fourth anchor, and a single cell
 * cannot hold two questions: *can this ever be measured* and *has it been
 * measured*. Measured before the guard existed, five of the nine cells
 * contradicted the registry, and one claimed a replay had actually been run
 * (`已实测回放（本轮实跑）`) for an anchor whose telemetry sits behind Google
 * Drive and which `official-data.yml` cannot even name as an input.
 *
 * So the assertions below are deliberately about the *rule* rather than about
 * today's table: the fixture registry and the fixture table are both written by
 * the test, and the one assertion that reads the shipped files is there to keep
 * the others from passing on an empty set.
 *
 * The guard is driven with `--table` pointed at a fixture, because the shipped
 * table is expected to change and a test that asserted its rows would fail every
 * time a target is added -- which would make it a nuisance rather than a check.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-l4-status.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[] = []): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-l4-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A table whose rows are supplied verbatim, so a wrong cell can be constructed. */
function writeTable(rows: string[], header?: string): string {
  const dir = mkdtempSync(join(scratch, 'tbl-'));
  const path = join(dir, 'table.md');
  writeFileSync(
    path,
    [
      '# fixture',
      '',
      header ??
        '| Format | L4 fetchability | L4 reading | Note |\n| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  );
  return path;
}

/** A table with one row per target, all correct. */
function correctRows(): string[] {
  return [
    '| `openrca-1.0` | unfetchable | — | note |',
    '| `openrca-2.0` | unfetchable | — | note |',
    '| `rcaeval-re1` | pending | — | note |',
    '| `rcaeval-re2` | pinned | `official-data.yml` | note |',
    '| `rcaeval-re3` | pending | — | note |',
    '| `rca100` | unfetchable | — | note |',
    '| `aiops2025` | unfetchable | — | note |',
    '| `cloud-opsbench` | unfetchable | — | note |',
    '| `itbench` | unfetchable | — | note |',
  ];
}

describe('scripts/check-l4-status.mjs · the L4 table agrees with the registry', () => {
  it('passes on the table the repository actually ships', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/);
    // A pass on an empty table would mean the guard found nothing to check.
    expect(result.stdout).toMatch(/9 row\(s\)/);
    expect(result.stdout).toMatch(/1 of 9 can have a reading/);
  });

  it('passes on a fixture table whose rows are all correct', () => {
    const result = run(['--table', writeTable(correctRows())]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/9 row\(s\) agree/);
  });

  // The defect itself. A row may not claim the anchor is unfetchable when the
  // registry has fetchable assets for it, or the reverse.
  it('fails when a row states a fetchability the registry contradicts', () => {
    const rows = correctRows();
    // `rcaeval-re2` is the pinned target; call it unfetchable.
    rows[3] = '| `rcaeval-re2` | unfetchable | — | note |';
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/rcaeval-re2/);
    expect(result.stderr).toMatch(/unfetchable/);
    expect(result.stderr).toMatch(/pinned/);
  });

  it('fails when a row calls a pending anchor pinned', () => {
    const rows = correctRows();
    rows[2] = '| `rcaeval-re1` | pinned | `official-data.yml` | note |';
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/rcaeval-re1/);
    expect(result.stderr).toMatch(/pending/);
  });

  // The second axis, and the one the OpenRCA 1.0 row got wrong. An anchor with
  // no measured pin cannot carry a reading, because a digest is the only thing
  // that records one -- there is no other field to read it from.
  it('fails when an unpinned anchor claims a reading', () => {
    const rows = correctRows();
    // This is the exact shape of the original defect, on the row that had it.
    rows[0] = '| `openrca-1.0` | unfetchable | `已实测回放` | note |';
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/openrca-1\.0/);
    expect(result.stderr).toMatch(/claims a reading/);
  });

  it('fails when a pending anchor claims a reading', () => {
    const rows = correctRows();
    rows[2] = '| `rcaeval-re1` | pending | `official-data.yml` | note |';
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/claims a reading/);
  });

  it('accepts a reading on the pinned anchor, so the rule is not simply "never"', () => {
    const result = run(['--table', writeTable(correctRows())]);
    expect(result.status).toBe(0);
  });

  // A target must not be able to leave the table by having its row deleted. The
  // registry names nine; the table has to account for all of them.
  it('fails when a target has no row at all', () => {
    const rows = correctRows().filter((r) => !r.includes('itbench'));
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/itbench/);
    expect(result.stderr).toMatch(/no row/);
  });

  it('fails when a row names no score target', () => {
    const rows = [...correctRows(), '| `not-a-target` | unfetchable | — | note |'];
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/names no score target/);
  });

  // The header is parsed, never a column index. This is the property that keeps
  // the guard honest if the table is reordered -- the alternative is a guard that
  // checks the wrong cell, which is the class of defect this whole iteration is
  // about.
  it('finds its columns by name, so reordering them does not break the rule', () => {
    const reordered =
      '| Format | L4 reading | L4 fetchability | Note |\n| --- | --- | --- | --- |';
    const rows = correctRows().map((r) => {
      const cells = r.split('|').slice(1, -1).map((c) => c.trim());
      return `| ${cells[0]} | ${cells[2]} | ${cells[1]} | ${cells[3]} |`;
    });
    const result = run(['--table', writeTable(rows, reordered)]);
    expect(result.status).toBe(0);
  });

  // And the converse: a table with only the fetch column is refused outright,
  // because one column is exactly the defect. This is the assertion that would
  // have failed on the published table before this iteration.
  it('refuses a table that has only one column for both questions', () => {
    const single =
      '| Format | L4 fetchability | Note |\n| --- | --- | --- |';
    const rows = correctRows().map((r) => {
      const cells = r.split('|').slice(1, -1).map((c) => c.trim());
      return `| ${cells[0]} | ${cells[1]} | ${cells[3]} |`;
    });
    const result = run(['--table', writeTable(rows, single)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/one column cannot hold both|reading axis/i);
  });

  it('fails on a missing table file rather than passing vacuously', () => {
    const result = run(['--table', join(scratch, 'does-not-exist.md')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not exist/);
  });
});
