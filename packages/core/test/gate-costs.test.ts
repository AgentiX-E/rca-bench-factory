import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { apartPercent, checkGateCosts, gateDrift, gateShardPlan } from '../../../scripts/gate-proofs.mjs';

/**
 * The table the gate audit's two shards are divided by.
 *
 * ## What the division was, and what it cost
 *
 * `verify-gates-are-testable.mjs` was sharded in v3.154 by **position**: every i-th gate
 * of the inventory. The rule was sound as a partition and silent about price, so the two
 * jobs that run it waited on each other -- **97 s against 232 s**, and every reading since
 * has been 30% to 45% apart while the arithmetic that built the plan said 0.0%. The
 * argument for position was that a split by measured seconds "would put the same gate in
 * different shards on different machines"; that is true of a split by *live* seconds and
 * false of a split by a **committed table**, which is the device the sites battery adopted
 * in v3.157 and measured: 247 s / 438 s became 341 s / 345 s.
 *
 * So `--costs` writes `golden-master/gate-costs.json` from a run that measured every gate,
 * `--shard` divides by it with the same longest-processing-time rule the sites battery
 * uses, and this file holds both halves of that: the table's verdicts (which are about
 * whether the table describes *this* tree) and the plan's (which are about the split).
 *
 * ## The half v3.161 left open, and what was decided
 *
 * `O-146`: the table's file count pins the *set* of files that name a gate, and every round
 * moves the tree inside that set -- a test file grows, a case is added. So a row also
 * carries `lines`, the count its evidence held when the table was written, and every run
 * prints the drift between the table and the tree it is dividing. It is a **reading** and
 * not a verdict, because a verdict would make every round that edits one gate's tests an
 * order to re-measure all 69 on a laptop, and the tree cannot tell a one-line comment from
 * a threefold growth -- a gate that fires on the harmless case is one re-measured by habit.
 * What is a verdict is the shape: a row without a line count is refused, because a run
 * would otherwise print a total that silently left a gate out, and blank reads as zero.
 *
 * ## Why the assertions are shaped the way they are
 *
 * `checkGateCosts` is asserted one refusal at a time, because a verdict that answers
 * "fine" for a table that names a gate nobody has and a gate nobody priced is a verdict
 * that only disagrees in one direction. `gateShardPlan` is asserted against a table whose
 * optimal split can be worked out on paper -- four gates, 100 / 60 / 50 / 40 -- so the
 * placement rule is checked rather than the output merely being different from position's.
 * And the shipped table is divided here too: the plan must be a partition of the inventory,
 * the same on every call, and closer than position's own split of the same numbers, which
 * is the one claim that would make the round pointless if it were false.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AUDIT = 'verify-gates-are-testable.mjs';
const SHIPPED = resolve(ROOT, 'golden-master', 'gate-costs.json');

/**
 * The script this file drives.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against what the
 * spawn calls actually reach, in both directions, and it caught this file on its first run:
 * every spawn below is handed a path built at runtime -- a copy inside a sandbox -- so the
 * script's name cannot be inferred from the call's own argument list.
 */
export const DRIVES = ['scripts/verify-gates-are-testable.mjs'];

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gate-costs-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * A table row as `--costs` writes it: the seconds a gate cost, how many files it ran, and
 * how many lines those files held.
 *
 * The line count is the fingerprint `O-146` asked for, and `40` is deliberately not the
 * line count of any fixture here: a table that agreed with the tree would make the drift
 * reading print zero and the test that reads it pass for the wrong reason.
 */
function table(gates: Record<string, number>, extra: Record<string, unknown> = {}) {
  return {
    measured: '2026-11-27',
    machine: 'linux x64, 32 cpu',
    source: 'node scripts/verify-gates-are-testable.mjs --costs golden-master/gate-costs.json',
    gates: Object.fromEntries(Object.entries(gates).map(([gate, ms]) => [gate, { ms, files: 1, lines: 40 }])),
    ...extra,
  };
}

/** The audit's own subject list, asked for rather than reconstructed from the inventory. */
function listedSubjects(): string[] {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', AUDIT), '--list'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 120_000,
  });
  if (result.status !== 0) throw new Error(`--list exited ${String(result.status)}: ${result.stderr}`);
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

let counter = 0;

/**
 * A throwaway tree the audit can run in: one directory per gate, a stub suite, a table.
 *
 * The stub is what `npx` resolves to, which is the whole experiment -- the audit reads a
 * nested suite's output for both its verdict and its price, so controlling the shell is
 * controlling the evidence. `sleep` is there so the two gates cost different amounts and
 * the table cannot be a constant.
 */
function treeOf(gates: string[], costs?: Record<string, number>): string {
  counter += 1;
  const tree = join(scratch, `tree-${String(counter)}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'test'), { recursive: true });
  mkdirSync(join(tree, 'bin'), { recursive: true });
  mkdirSync(join(tree, 'golden-master'), { recursive: true });
  for (const module of [AUDIT, 'gate-proofs.mjs', 'site-proofs.mjs']) {
    copyFileSync(resolve(ROOT, 'scripts', module), join(tree, 'scripts', module));
  }
  // The lesson of finding 199: a fixture is a tree the script could run in, and a module
  // it imports that the fixture does not carry is a stack trace instead of a sentence.
  mkdirSync(join(tree, 'node_modules'), { recursive: true });
  symlinkSync(resolve(ROOT, 'node_modules', 'typescript'), join(tree, 'node_modules', 'typescript'), 'dir');
  for (const [index, gate] of gates.entries()) {
    writeFileSync(join(tree, 'scripts', gate), 'process.exit(1);\n');
    writeFileSync(join(tree, 'packages', 'core', 'test', `probe-${String(index)}.test.ts`), `const SUBJECT = 'scripts/${gate}';\n`);
  }
  writeFileSync(
    join(tree, 'golden-master', 'gate-sites.json'),
    JSON.stringify({ sites: gates.map((gate) => ({ script: `scripts/${gate}` })) }),
  );
  if (costs !== undefined) {
    writeFileSync(join(tree, 'golden-master', 'gate-costs.json'), JSON.stringify(table(costs)));
  }
  const npx = join(tree, 'bin', 'npx');
  writeFileSync(
    npx,
    "#!/bin/sh\nsleep 0.3; printf ' Duration  500ms (transform 1ms, setup 0ms, collect 1ms, tests 498ms)\\n'; " +
      "printf '\\303\\227 void\\n'\nexit 1\n",
  );
  chmodSync(npx, 0o755);
  return tree;
}

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function audit(tree: string, args: string[], env: Record<string, string> = {}): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', AUDIT), ...args], {
    encoding: 'utf8',
    cwd: tree,
    env: { ...process.env, PATH: `${join(tree, 'bin')}:${process.env['PATH'] ?? ''}`, ...env },
    timeout: 120_000,
  });
  if (result.error !== undefined) return { status: -1, stdout: '', stderr: result.error.message };
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function shipped(): Record<string, unknown> {
  return JSON.parse(readFileSync(SHIPPED, 'utf8')) as Record<string, unknown>;
}

/**
 * The budget this file's suite is given, in milliseconds.
 *
 * Every case that spawns the audit pays a process start plus the stub's 0.3 s, and the
 * two cases that run it twice pay for two, so the file is a sum of starts rather than one
 * slow call -- the shape `check-test-budgets` asks a declaration for.
 */
const SUITE_BUDGET_MS = 60_000;

describe('scripts/gate-proofs.mjs · the table the gate audit is divided by', { timeout: SUITE_BUDGET_MS }, () => {
  it('refuses a table that cannot price a gate, one refusal at a time', () => {
    const inventory: [string, number | null][] = [['a.mjs', 1]];
    const shippedRow = { ms: 10, files: 1, lines: 40 };
    const cases: [string, Record<string, unknown>, string][] = [
      ['no map at all', { ...table({}), gates: undefined }, 'no `gates` map'],
      ['gates as a list', { ...table({}), gates: [] }, 'no `gates` map'],
      ['no day', { ...table({ 'a.mjs': 10 }), measured: '2026-11' }, 'does not say the day it was measured'],
      ['no machine', { ...table({ 'a.mjs': 10 }), machine: '  ' }, 'does not say which machine measured it'],
      ['a source that names nothing', { ...table({ 'a.mjs': 10 }), source: 'somewhere' }, 'names neither the command'],
      ['a gate with no row', table({ 'b.mjs': 10 }), 'does not name it'],
      ['a row with no gate', { ...table({ 'a.mjs': 10, 'gone.mjs': 10 }) }, 'the inventory does not name'],
      ['a price of zero', { ...table({ 'a.mjs': 0 }) }, 'not a measured number of milliseconds'],
      ['a price of a fraction of a millisecond', { ...table({ 'a.mjs': 1.5 }) }, 'not a measured number of milliseconds'],
      ['a file count that is not a count', { ...table({ 'a.mjs': 10 }), gates: { 'a.mjs': { ms: 10, files: 'one' } } }, 'is not a count'],
      [
        'a file count that disagrees with the tree',
        { ...table({ 'a.mjs': 10 }), gates: { 'a.mjs': { ms: 10, files: 2 } } },
        'is named by 1 test file(s) and the table says 2',
      ],
      // `O-146`: the fingerprint the drift reading is computed from. A row without one is
      // refused rather than read as "no drift", because the run would then print a total
      // that silently left a gate out -- blank reading as zero.
      ['no line count', { ...table({ 'a.mjs': 10 }), gates: { 'a.mjs': { ms: 10, files: 1 } } }, "`a.mjs`'s lines is undefined"],
      [
        'a line count that is not a count',
        { ...table({ 'a.mjs': 10 }), gates: { 'a.mjs': { ms: 10, files: 1, lines: 'many' } } },
        "`a.mjs`'s lines is many",
      ],
      [
        'a line count of zero',
        { ...table({ 'a.mjs': 10 }), gates: { 'a.mjs': { ms: 10, files: 1, lines: 0 } } },
        'is not a count of the lines',
      ],
    ];
    for (const [what, broken, said] of cases) {
      const errors = checkGateCosts(inventory, broken);
      expect(errors.length, what).toBeGreaterThan(0);
      expect(errors.join('\n'), what).toContain(said);
    }
    // The positive control: the same table with nothing removed is accepted, so the cases
    // above are not satisfied by a verdict that refuses everything.
    expect(checkGateCosts(inventory, { ...table({ 'a.mjs': 10 }), gates: { 'a.mjs': shippedRow } })).toEqual([]);
  });

  it('prices every gate the shipped inventory names, and no gate it does not', () => {
    const rows = (shipped() as { gates: Record<string, { ms: number; files: number; lines: number }> }).gates;
    const inventory = listedSubjects();
    // Identity in both directions: a table that has lost a row cannot divide the tree, and
    // a table that holds a row for a gate nobody has was measured on a tree that moved.
    expect(Object.keys(rows).sort()).toEqual([...inventory].sort());
    for (const gate of inventory) {
      expect(Number.isInteger(rows[gate]?.ms), gate).toBe(true);
      expect(rows[gate]?.ms, gate).toBeGreaterThan(0);
      // The fingerprint `O-146` added: every shipped row says how many lines its evidence
      // held when the table was written, so a later run can read the drift.
      expect(Number.isInteger(rows[gate]?.lines), gate).toBe(true);
      expect(rows[gate]?.lines, gate).toBeGreaterThan(0);
    }
    // And the verdict agrees, which is what the script acts on rather than what this file
    // reads: the counts are passed as `null` because `--list` does not sweep the test
    // directory, so identity and price are what can be checked here.
    expect(checkGateCosts(inventory.map((gate) => [gate, null]), shipped())).toEqual([]);
  });

  it('places the dearest gate on the emptiest shard, and says what each shard costs', () => {
    // Four gates whose best split can be worked out on paper: 100 and 40 against 60 and 50,
    // which is 140 / 110 -- closer than position's 150 / 100 and than any other assignment.
    // A rule that merely produced *some* partition would fail the loads.
    const plan = gateShardPlan(
      [['a.mjs', 1], ['b.mjs', 1], ['c.mjs', 1], ['d.mjs', 1]],
      2,
      table({ 'a.mjs': 100, 'b.mjs': 60, 'c.mjs': 50, 'd.mjs': 40 }),
    );
    expect(plan.shards).toEqual([['a.mjs', 'd.mjs'], ['b.mjs', 'c.mjs']]);
    expect(plan.loads).toEqual([140, 110]);
    expect(apartPercent(plan.loads)).toBeCloseTo((30 / 140) * 100, 6);
    // Two equal gates are split rather than both landing on one shard, and the tie is
    // broken by name so the plan is the same on every machine.
    expect(gateShardPlan([['b.mjs', 1], ['a.mjs', 1]], 2, table({ 'a.mjs': 10, 'b.mjs': 10 })).shards).toEqual([
      ['a.mjs'],
      ['b.mjs'],
    ]);
  });

  it('is a pure function of the table and the inventory', () => {
    const inventory = listedSubjects();
    const byGate = inventory.map((gate) => [gate, null] as [string, null]);
    const once = gateShardPlan(byGate, 2, shipped());
    const twice = gateShardPlan(byGate, 2, shipped());
    expect(twice).toEqual(once);
    // Inventory order inside a shard, so `--list --shard` and the unsharded list can be
    // compared line by line and the run order does not depend on where a gate landed.
    for (const shard of once.shards) {
      const positions = shard.map((gate) => inventory.indexOf(gate));
      expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    }
  });

  it('reads how far the tree has moved from the table, in the lines its evidence holds', () => {
    // `O-146`, decided as a reading rather than a verdict: a test file that keeps its name
    // and grows is invisible to the file count, and a verdict on the line count would make
    // every round that edits one gate's tests an order to re-measure all 69.
    const rows = {
      'a.mjs': { ms: 1, files: 1, lines: 100 },
      'b.mjs': { ms: 1, files: 1, lines: 40 },
      'c.mjs': { ms: 1, files: 1, lines: 10 },
    };
    const same = gateDrift(rows, new Map([['a.mjs', 100], ['b.mjs', 40], ['c.mjs', 10]]));
    expect(same).toEqual({ gates: 3, tableLines: 150, treeLines: 150, change: 0, moved: [], widest: null });
    // One gate doubled: the change is of the total, and the widest is named so the sentence
    // a run prints points at the number least likely to still be right.
    const grown = gateDrift(rows, new Map([['a.mjs', 300], ['b.mjs', 40], ['c.mjs', 10]]));
    // 150 lines became 350: the change is of the total, so one gate tripling is +133%.
    expect(grown?.change).toBeCloseTo(((350 - 150) / 150) * 100, 6);
    expect(grown?.moved).toEqual([{ gate: 'a.mjs', from: 100, to: 300 }]);
    expect(grown?.widest?.gate).toBe('a.mjs');
    // Ordered by how much moved, not by name: +50 lines outranks +10 even though `a.mjs`
    // sorts first, because the order exists to say which price to distrust most.
    expect(gateDrift(rows, new Map([['a.mjs', 110], ['b.mjs', 90], ['c.mjs', 10]]))?.moved.map((one) => one.gate)).toEqual([
      'b.mjs',
      'a.mjs',
    ]);
    // A gate the tree says nothing about is a move of its whole size with an unread end --
    // not a gate that did not move, which is what `0 - from` would have made it.
    const silent = gateDrift(rows, new Map([['a.mjs', 100], ['b.mjs', 40]]));
    expect(silent?.moved).toEqual([{ gate: 'c.mjs', from: 10, to: null }]);
    expect(silent?.treeLines).toBe(140);
    // Nothing to compare is `null` rather than a tidy zero.
    expect(gateDrift({}, new Map())).toBeNull();
    // A row with no line count is skipped, and the verdict above is what refuses it: a
    // drift that read the missing count as zero would report a fall nobody measured.
    const unreadable = gateDrift({ 'a.mjs': { ms: 1, files: 1 } }, new Map([['a.mjs', 10]]));
    expect(unreadable?.tableLines).toBe(0);
    expect(unreadable?.change).toBeNull();
    expect(unreadable?.moved).toEqual([]);
  });

  it('refuses to place a gate the table does not price', () => {
    // The sentence is named by its own table, not by "a table": `assignShards` next door
    // refuses the same gate with a pointer at `sensitivity-costs.json`, and an assertion
    // loose enough to accept either would pass with this refusal deleted -- measured, by
    // `verify-sites-are-sensitive`, which reported this claim as one that reaches the exit
    // and does not depend on it.
    expect(() => gateShardPlan([['a.mjs', 1], ['b.mjs', 1]], 2, table({ 'a.mjs': 10 }))).toThrow(
      /no measured cost for b\.mjs[\s\S]*regenerate golden-master\/gate-costs\.json/,
    );
    // A table with no map at all is the shape a truncated file produces, and the sentence
    // has to name it rather than divide an inventory by `undefined`.
    expect(() => gateShardPlan([['a.mjs', 1]], 2, { ...table({ 'a.mjs': 10 }), gates: null })).toThrow(
      /has no `gates` map/,
    );
    expect(() => gateShardPlan([['a.mjs', 1]], 0, table({ 'a.mjs': 10 }))).toThrow(/not a split/);
  });

  it('divides the shipped inventory once, and closer than position divides it', () => {
    const byGate = listedSubjects().map((gate) => [gate, null] as [string, null]);
    const rows = (shipped() as { gates: Record<string, { ms: number }> }).gates;
    const plan = gateShardPlan(byGate, 2, shipped());
    // A partition: every gate in some shard, no gate in two, and neither shard empty.
    const union = new Set(plan.shards.flat());
    expect(union.size).toBe(byGate.length);
    expect(plan.shards.flat()).toHaveLength(byGate.length);
    for (const shard of plan.shards) expect(shard.length).toBeGreaterThan(0);

    // The claim the round exists for, measured on the same numbers: what position leaves,
    // the table removes. Computed here rather than quoted, because the gap is a property of
    // the table that ships and would go stale in prose.
    const positional = [0, 1].map((which) =>
      byGate.filter((_, position) => position % 2 === which).reduce((sum, [gate]) => sum + rows[gate].ms, 0),
    );
    const planGap = apartPercent(plan.loads) ?? 0;
    const positionGap = apartPercent(positional) ?? 0;
    expect(planGap).toBeLessThan(positionGap);
    // And the plan is not balanced by accident: LPT's bound is that the heavier shard is at
    // most the dearest gate above the average, which for this table is a fraction of it.
    const dearest = Math.max(...Object.values(rows).map((row) => row.ms));
    const average = plan.loads.reduce((sum, load) => sum + load, 0) / plan.loads.length;
    expect(Math.max(...plan.loads)).toBeLessThanOrEqual(average + dearest);
  });

  it('answers `--list --shard` with the plan it would measure', () => {
    const plan = gateShardPlan(
      listedSubjects().map((gate) => [gate, null] as [string, null]),
      2,
      shipped(),
    );
    for (const index of [1, 2]) {
      const listed = spawnSync(process.execPath, [resolve(ROOT, 'scripts', AUDIT), '--list', '--shard', `${String(index)}/2`], {
        encoding: 'utf8',
        cwd: ROOT,
        timeout: 120_000,
      });
      expect(listed.status, `--list --shard ${String(index)}/2`).toBe(0);
      expect((listed.stdout ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '')).toEqual(
        plan.shards[index - 1],
      );
    }
  });

  it('refuses a shard with no table, with a stale one, and with a row for a gate that is gone', () => {
    const tree = treeOf(['check-throwaway.mjs', 'gen-throwaway.mjs'], {
      'check-throwaway.mjs': 10,
      'gen-throwaway.mjs': 10,
    });
    // No table is not "one shard": the halves `ci.yml` runs and the halves a local `--shard`
    // runs have to be the same halves, and a fallback would be a second partition under one
    // name -- the shape the sites battery refuses for the same reason.
    const missing = audit(tree, ['--list', '--shard', '1/2'], { RCA_GATE_COSTS: join(tree, 'nowhere.json') });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('no cost table at');
    expect(missing.stderr).toContain('--costs golden-master/gate-costs.json');

    const stale = join(scratch, 'stale.json');
    writeFileSync(stale, JSON.stringify(table({ 'check-throwaway.mjs': 10 })));
    const refused = audit(tree, ['--list', '--shard', '1/2'], { RCA_GATE_COSTS: stale });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('gen-throwaway.mjs');
    expect(refused.stderr).toContain('does not name it');

    const extra = join(scratch, 'extra.json');
    writeFileSync(extra, JSON.stringify(table({ 'check-throwaway.mjs': 10, 'gen-throwaway.mjs': 10, 'gone.mjs': 10 })));
    const unknown = audit(tree, ['--list', '--shard', '1/2'], { RCA_GATE_COSTS: extra });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('gone.mjs');
    expect(unknown.stderr).toContain('the inventory does not name');
  });

  it('writes the table from a run that measured every gate, and reads its own table back', () => {
    const tree = treeOf(['check-throwaway.mjs', 'gen-throwaway.mjs']);
    const target = join(tree, 'golden-master', 'gate-costs.json');
    const run = audit(tree, ['--costs', target]);
    expect(run.status, run.stderr).toBe(0);
    const written = JSON.parse(readFileSync(target, 'utf8')) as {
      measured: string;
      machine: string;
      source: string;
      gates: Record<string, { ms: number; files: number; lines: number }>;
    };
    expect(written.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(written.machine.trim()).not.toBe('');
    // The source names the command *and* the file it wrote: a table with no way back to the
    // run that produced it is a number from nowhere, and the round that refreshes it has
    // nothing to compare with. Written relative to the repository, because an absolute path
    // is a fact about the machine that measured rather than about the tree.
    expect(written.source).toContain('--costs');
    expect(written.source).toContain('gate-costs.json');
    expect(written.source).not.toContain(tmpdir());
    expect(Object.keys(written.gates).sort()).toEqual(['check-throwaway.mjs', 'gen-throwaway.mjs']);
    for (const gate of Object.keys(written.gates)) {
      expect(written.gates[gate]?.files, gate).toBe(1);
      expect(written.gates[gate]?.ms, gate).toBeGreaterThanOrEqual(300);
      // The fingerprint, from the tree the run measured: each probe file is one line of
      // source and the newline that ends it, so a writer that counted nothing would be
      // caught here rather than by a reader wondering why the drift is always zero.
      expect(written.gates[gate]?.lines, gate).toBe(2);
    }
    // There was no table in this tree before the run, so the drift line says so instead of
    // printing a comparison against nothing.
    expect(run.stdout).toContain('drift: no cost table in this tree, so this run has nothing to be read against');
    // The prices are the ones the run printed, so the table is the summary rather than a
    // second measurement of the same subjects.
    const parts = run.stdout
      .split('\n')
      .filter((line) => /^(CAUGHT|SURVIVED|UNATTRIBUTED) /.test(line))
      .map((line) => Number(/(\d+\.\d) s\s*$/.exec(line)?.[1]) * 1000);
    const child = Number(/cost: \d+ run\(s\), (\d+\.\d) s of child time/.exec(run.stdout)?.[1]) * 1000;
    expect(child).toBeGreaterThan(0);
    expect(Math.abs(parts.reduce((sum, part) => sum + part, 0) - child)).toBeLessThanOrEqual(200);

    // And a shard, which now has a table to be divided by, prints what the halves will cost
    // and which one this run is -- the number the workflow's wall clock is chosen by.
    const shard = audit(tree, ['--list', '--shard', '1/2']);
    expect(shard.status, shard.stderr).toBe(0);
    expect(shard.stderr).toContain('1/2=');
    expect(shard.stderr).toContain('2/2=');
  });

  it("prints the tree's drift from the table, and this half against the price it was given", () => {
    const tree = treeOf(['check-throwaway.mjs', 'gen-throwaway.mjs'], {
      'check-throwaway.mjs': 10_000,
      'gen-throwaway.mjs': 10_000,
    });
    const run = audit(tree, ['--shard', '1/2']);
    expect(run.status, run.stderr).toBe(0);
    // Two rows of 40 lines in the table, two probe files of two lines each in the tree, and
    // one of the two gates on this shard: the reading is of the half this run measured, so
    // the totals are that half's rows against that half's files.
    expect(run.stdout).toContain('drift: the table priced these 1 gate(s) when their naming files held 40 line(s)');
    expect(run.stdout).toContain('this tree holds 2 (-95.0%)');
    expect(run.stdout).toContain('40 -> 2 line(s)');
    // The plan against the machine: the table prices this half at 10.0 s, and the stub's
    // own seconds are whatever they were. The two numbers belong on one line because
    // neither answers the question on its own -- v3.157 measured the same table balancing
    // one tree at 0.1% and the next reading of it at 30%.
    expect(run.stdout).toMatch(
      /half: the table prices the gate\(s\) this run measured at 10\.0 s; they spent [\d.]+ s \([+-][\d.]+%\)/,
    );
    expect(run.stdout).toContain('a plan is of a table, the seconds are of this machine');
  });

  it('refuses to write a table from a run that did not measure every gate', () => {
    // A gate no test names is the shape that matters: the run reports it NO-TEST and goes
    // on, so a writer that took whatever was measured would price that gate at nothing and
    // the plan would put it wherever the arithmetic left a hole. The refusal is the whole
    // difference between a table and a half-measured one.
    const tree = treeOf(['check-throwaway.mjs', 'gen-throwaway.mjs']);
    rmSync(join(tree, 'packages', 'core', 'test', 'probe-1.test.ts'));
    const refused = audit(tree, ['--costs', join(tree, 'golden-master', 'gate-costs.json')]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('1 of 2 gate(s) were not measured');
    expect(refused.stderr).toContain('gen-throwaway.mjs');
    expect(refused.stderr).toContain('a table is a measurement of every gate');
  });

  it('refuses `--costs` beside a shard or a list, because neither measured every gate', () => {
    const tree = treeOf(['check-throwaway.mjs']);
    for (const args of [['--costs', join(tree, 'x.json'), '--shard', '1/2'], ['--costs', join(tree, 'x.json'), '--list']]) {
      const refused = audit(tree, args);
      expect(refused.status, args.join(' ')).toBe(1);
      expect(refused.stderr).toContain('usage: node scripts/verify-gates-are-testable.mjs');
    }
    const bare = audit(tree, ['--costs']);
    expect(bare.status).toBe(1);
    expect(bare.stderr).toContain('usage: node scripts/verify-gates-are-testable.mjs');
  });
});
