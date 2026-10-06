import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/check-l4-status.mjs',
];


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
const REGISTRY = resolve(ROOT, 'golden-master', 'official-assets.json');

/**
 * The registry is read, and the fixture rows are built from it rather than from
 * a remembered layout.
 *
 * The first version of this file hard-coded `rcaeval-re1` as `pending` and
 * `rcaeval-re2` as the pinned target, and used their row *index* to address
 * them. That made every assertion depend on which anchors happened to be pinned
 * on the day the file was written: when the RE1 digests were finally measured
 * and merged, "fails when a row calls a pending anchor pinned" started calling
 * a pinned anchor pending -- so the mutation it applied was the *correct* state,
 * the guard passed, and the test reported a failure that was entirely its own.
 *
 * The guard under test derives the fetch axis from this registry precisely so a
 * hand edit cannot disagree with it. A test that derives its inputs from
 * somewhere else is checking a different question, and it fails for its own
 * reasons the moment the registry changes. Deriving the same way is what makes
 * the mutations below mean what their names say.
 */
interface Asset {
  anchor: string;
  sha256: string | null;
}
interface Registry {
  assets: Asset[];
  notFetchable: { anchor: string }[];
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as Registry;

const ALL_TARGETS = [
  'rcaeval-re1',
  'rcaeval-re2',
  'rcaeval-re3',
  'openrca-1.0',
  'openrca-2.0',
  'rca100',
  'aiops2025',
  'cloud-opsbench',
  'itbench',
];

/** The same classification the guard computes, so the fixture cannot disagree with it. */
function fetchState(target: string): 'pinned' | 'pending' | 'unfetchable' {
  if (registry.notFetchable.some((n) => n.anchor === target)) return 'unfetchable';
  const assets = registry.assets.filter((a) => a.anchor === target);
  return assets.some((a) => a.sha256 !== null) ? 'pinned' : 'pending';
}

const PINNED = ALL_TARGETS.filter((t) => fetchState(t) === 'pinned');
const PENDING = ALL_TARGETS.filter((t) => fetchState(t) === 'pending');
const UNFETCHABLE = ALL_TARGETS.filter((t) => fetchState(t) === 'unfetchable');

/**
 * A fixture that has to be non-empty for the tests that mutate it to mean
 * anything.
 *
 * "fails when a row calls a pending anchor pinned" needs an anchor that is
 * pending *now*; if every target were pinned the test would have nothing to
 * mutate and would pass vacuously. Asserting the fixture's own premises is what
 * keeps a green run from being a run that tested nothing.
 */
if (PENDING.length === 0 || PINNED.length === 0 || UNFETCHABLE.length === 0) {
  throw new Error(
    `this file needs at least one ${PENDING.length === 0 ? 'pending ' : ''}` +
      `${PINNED.length === 0 ? 'pinned ' : ''}` +
      `${UNFETCHABLE.length === 0 ? 'unfetchable ' : ''}target to test the guard's rules, ` +
      `and the registry currently has none`,
  );
}

const A_PINNED = PINNED[0];
const A_PENDING = PENDING[0];
const AN_UNFETCHABLE = UNFETCHABLE[0];

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

/** A table with one row per target, each in the state the registry gives it. */
function correctRows(): string[] {
  return ALL_TARGETS.map((target) => {
    const state = fetchState(target);
    // A reading is what a pin records and nothing else does, so only a pinned
    // target gets one -- the same rule the guard applies.
    const reading = state === 'pinned' ? '`official-data.yml`' : '—';
    return `| \`${target}\` | ${state} | ${reading} | note |`;
  });
}

/** The index of a target's row inside `correctRows`. */
function rowOf(target: string): number {
  const index = ALL_TARGETS.indexOf(target);
  if (index === -1) throw new Error(`'${target}' is not a target this fixture builds`);
  return index;
}

describe('scripts/check-l4-status.mjs · the L4 table agrees with the registry', () => {
  it('passes on the table the repository actually ships', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/);
    // A pass on an empty table would mean the guard found nothing to check.
    expect(result.stdout).toMatch(/9 row\(s\)/);
    expect(result.stdout).toMatch(
      new RegExp(`${PINNED.length} of 9 can have a reading`),
    );
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
    // A pinned target called unfetchable.
    rows[rowOf(A_PINNED)] = `| \`${A_PINNED}\` | unfetchable | — | note |`;
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(new RegExp(A_PINNED.replace(/\./g, '\\.')));
    expect(result.stderr).toMatch(/unfetchable/);
    expect(result.stderr).toMatch(/pinned/);
  });

  it('fails when a row calls a pending anchor pinned', () => {
    const rows = correctRows();
    rows[rowOf(A_PENDING)] = `| \`${A_PENDING}\` | pinned | \`official-data.yml\` | note |`;
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(new RegExp(A_PENDING.replace(/\./g, '\\.')));
    expect(result.stderr).toMatch(/pending/);
  });

  // The converse assignment, so the pair is genuinely two-sided: a pinned row
  // called pending is the same class of defect in the other direction, and a
  // guard that only caught one direction would let the other publish.
  it('fails when a row calls a pinned anchor pending', () => {
    const rows = correctRows();
    rows[rowOf(A_PINNED)] = `| \`${A_PINNED}\` | pending | — | note |`;
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(new RegExp(A_PINNED.replace(/\./g, '\\.')));
    expect(result.stderr).toMatch(/pinned/);
  });

  // The second axis, and the one the OpenRCA 1.0 row got wrong. An anchor with
  // no measured pin cannot carry a reading, because a digest is the only thing
  // that records one -- there is no other field to read it from.
  it('fails when an unfetchable anchor claims a reading', () => {
    const rows = correctRows();
    // This is the exact shape of the original defect, on the class of row that
    // had it: a channel that does not exist, claiming a run happened.
    rows[rowOf(AN_UNFETCHABLE)] = `| \`${AN_UNFETCHABLE}\` | unfetchable | \`已实测回放\` | note |`;
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(new RegExp(AN_UNFETCHABLE.replace(/\./g, '\\.')));
    expect(result.stderr).toMatch(/claims a reading/);
  });

  it('fails when a pending anchor claims a reading', () => {
    const rows = correctRows();
    // Pending and unfetchable fail for the same reason -- no digest records a
    // reading -- so both directions are pinned down rather than one standing in
    // for the other.
    rows[rowOf(A_PENDING)] = `| \`${A_PENDING}\` | pending | \`official-data.yml\` | note |`;
    const result = run(['--table', writeTable(rows)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/claims a reading/);
  });

  it('accepts a reading on the pinned anchor, so the rule is not simply "never"', () => {
    const result = run(['--table', writeTable(correctRows())]);
    expect(result.status).toBe(0);
    // And the fixture being accepted must include a reading, or "accepts a
    // reading" would be satisfied by a table with none.
    expect(correctRows().some((r) => r.includes('official-data.yml'))).toBe(true);
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
