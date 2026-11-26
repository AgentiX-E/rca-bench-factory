import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assignShards,
  checkShardCosts,
  claimedSites,
  claimsByFile,
  shardLoad,
  tableCosts,
} from '../../../scripts/site-proofs.mjs';

/**
 * The measurement the two shards are divided by.
 *
 * `golden-master/sensitivity-costs.json` holds, for every claimant file, one baseline
 * run and the mutant runs it paid for. `verify-sites-are-sensitive.mjs --costs` writes
 * it from a run that measured every claimant; `shardClaims` reads it to decide which
 * files travel with `--shard 1/2` and which with `--shard 2/2`.
 *
 * ## Why these cases are not claimants
 *
 * The battery runs every file named in `gate-sites.json` as a claimant, and the file
 * that spawns the gate's exits is one of them. These cases spawn nothing -- their
 * subject is a committed JSON and the verdicts a function returns about it -- so the
 * battery does not run them, and the table can be written by a run of the battery that
 * does not need the table to exist yet. A case about an artifact that the artifact's own
 * producer must satisfy would be a cycle: the run that writes the table would be red
 * until the table was there.
 *
 * ## What is held
 *
 * The verdicts of `checkShardCosts` (a table is about one tree, and the tree moves) and
 * the acceptance number for the round that introduced it: what the pair of shards costs,
 * measured against the 44% the positional split left.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INVENTORY = join(ROOT, 'golden-master', 'gate-sites.json');
const COSTS = join(ROOT, 'golden-master', 'sensitivity-costs.json');

function byFileOf() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  return claimsByFile(claimedSites(inventory));
}

/** The shipped table, or a copy of it with one field edited. */
function shipped(edit: (copy: any) => void = () => {}) {
  const copy = JSON.parse(readFileSync(COSTS, 'utf8'));
  edit(copy);
  return copy;
}

/**
 * A table that describes this inventory and nothing else.
 *
 * Prices are flat, so the partition it implies is by count rather than by seconds: what
 * the cases below ask of these tables is the coverage verdict, not the balance.
 */
function fromInventory() {
  return {
    measured: '2026-01-01',
    machine: 'the case',
    source: 'node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json',
    files: Object.fromEntries(
      byFileOf().map(([file, claims]) => [
        file,
        { claims: claims.length, runs: claims.length + 1, baselineMs: 1000, mutantMs: 1000 },
      ]),
    ),
  };
}

describe('the cost table the shards are divided by', () => {
  it('describes this inventory, and says which day and which machine measured it', () => {
    const table = shipped();
    expect(checkShardCosts(byFileOf(), table)).toEqual([]);
    // A seconds figure with no date is a claim about a tree that may not exist; the
    // table carries the day, the machine and the command, so a reader can tell a
    // re-measurement from a copy of one.
    expect(table.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(table.machine)).not.toBe('');
    // Either history is a measurement: the gate wrote it with `--costs`, or a round read
    // it out of a run's own per-file rows (which is the better of the two, because those
    // seconds belong to the machine that will be divided). What is refused is `source`
    // naming neither.
    expect(String(table.source)).toMatch(/--costs|run \d{10,12}/);
    // Every row is a measurement: a baseline and at least one mutant run, since a
    // claimant that makes a claim runs once per claim.
    for (const [file, row] of Object.entries(table.files) as [string, any][]) {
      expect(Number.isInteger(row.claims) && row.claims > 0, file).toBe(true);
      expect(Number.isInteger(row.runs) && row.runs >= row.claims + 1, file).toBe(true);
      expect(Number.isInteger(row.baselineMs) && row.baselineMs > 0, file).toBe(true);
      expect(Number.isInteger(row.mutantMs) && row.mutantMs > 0, file).toBe(true);
    }
  });

  it('divides the shipped claimants into two halves less than 15% apart', () => {
    // The acceptance criterion for this round, stated as a number. The pair it replaced
    // read **247 s** and **438 s** of one command (reading 52), 44% apart, which is
    // three minutes of one runner waiting for the other. A partition by cost cannot make
    // the halves equal -- the dearest claimant is indivisible -- but it can make the gap
    // smaller than the granularity it has; 15% is the budget the round commits to, and
    // the number the next round's claimant has to be measured against.
    const table = shipped();
    const byFile = byFileOf();
    const costs = tableCosts(table);
    // The same two numbers the shard prints at the top of its log (`shardLoad`), so the
    // budget is asserted on the quantity the workflow is predicted from rather than on a
    // second sum that agrees with it by construction.
    const loads = shardLoad(assignShards(byFile, 2, costs), costs);
    const heavier = Math.max(...loads);
    const lighter = Math.min(...loads);
    expect(loads.length).toBe(2);
    expect(lighter).toBeGreaterThan(0);
    expect((heavier - lighter) / heavier).toBeLessThan(0.15);
    // And the half the workflow calls `1/2` is the cheaper one, because the claim
    // battery it also carries (`verify-claims-are-sensitive`, 22 s) is charged to that
    // job by the reading and not by this table.
    expect(loads[0]).toBeLessThanOrEqual(loads[1]);
  });

  it('accepts provenance that names the run it was read from, and refuses one that names nothing', () => {
    // A table measured by a local run and a table rebuilt from a runner's own per-file
    // rows are the same artifact with two histories, and the second is the better one:
    // the seconds that decide a runner's halves should be that runner's. So the field
    // names either the command that wrote it or the run it was read from -- what it may
    // not be is a sentence that names neither, which is a number from nowhere.
    const byFile = byFileOf();
    const fromRun = fromInventory();
    fromRun.source = 'the per-file rows of run 45799554098, shards 1/2 and 2/2';
    expect(checkShardCosts(byFile, fromRun)).toEqual([]);
    const nowhere = fromInventory();
    nowhere.source = 'a table somebody wrote down';
    expect(checkShardCosts(byFile, nowhere).join('\n')).toContain('names neither');
  });

  it('refuses a table that names a file this tree does not claim, or misses one it does', () => {
    const byFile = byFileOf();
    const dropped = fromInventory();
    delete dropped.files[Object.keys(dropped.files).sort()[0]];
    expect(checkShardCosts(byFile, dropped).join('\n')).toContain('does not name it');
    const extra = fromInventory();
    extra.files['packages/core/test/gone.test.ts'] = {
      claims: 1,
      runs: 2,
      baselineMs: 1000,
      mutantMs: 1000,
    };
    expect(checkShardCosts(byFile, extra).join('\n')).toContain('makes no claim on this tree');
    // The count is part of the cost's definition -- one baseline plus one run per claim
    // -- so a file that gained a claim and kept its old seconds has a number that
    // describes a claim that no longer exists.
    const stale = fromInventory();
    stale.files[Object.keys(stale.files).sort()[0]].claims += 1;
    expect(checkShardCosts(byFile, stale).join('\n')).toContain('the table says');
    // And the provenance is read, not merely carried.
    for (const missing of ['measured', 'machine', 'source'] as const) {
      const dropped2 = fromInventory() as Record<string, unknown>;
      delete dropped2[missing];
      expect(checkShardCosts(byFile, dropped2).join('\n')).toContain(missing);
    }
    expect(checkShardCosts(byFile, { files: [] }).join('\n')).toContain('no `files` map');
  });

  it('refuses a row that is not a measurement a partition can be made of', () => {
    const byFile = byFileOf();
    for (const field of ['baselineMs', 'mutantMs'] as const) {
      const broken = fromInventory();
      broken.files[Object.keys(broken.files).sort()[0]][field] = 0;
      expect(checkShardCosts(byFile, broken).join('\n')).toContain(field);
    }
  });
});
