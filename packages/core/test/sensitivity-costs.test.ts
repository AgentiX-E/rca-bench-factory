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
    // What the assertion above cannot say, and what the round after v3.158 found it
    // saying anyway: `shard 1/2` also carries the claims battery (`verify-claims-are-
    // sensitive`, 22 s), so the two *jobs* are the quantity with a wall clock, not the
    // two halves. Until the aim, the halves were 15% apart and "shard 1 is the cheaper
    // one" was a real instruction; now they divide to within a few hundred milliseconds
    // -- measured **775.2 s / 775.2 s** -- and which of two equal halves lands in index 0
    // is LPT's tie-break, not a decision anybody made. So the property is stated on the
    // clocks, which is what the workflow spends: the job holding the claims battery must
    // not end up the slower one by more than the same 15%.
    const CLAIMS_BATTERY_MS = 22_000;
    const clocks = [loads[0] + CLAIMS_BATTERY_MS, loads[1]];
    expect((Math.max(...clocks) - Math.min(...clocks)) / Math.max(...clocks)).toBeLessThan(0.15);
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

/**
 * The other half of the same measurement: which test can see each claim.
 *
 * A claim's price was, until v3.158, the whole file it lives in -- so a file's price was
 * its own runtime multiplied by its claim count, and two claimants of sixty-eight were
 * **45%** of a 2 632 s battery. The table now records the test that noticed each claim,
 * and the battery aims the next run at it: measured at **1 375 ms against 7 868 ms** for
 * one claim of `ci-budget.test.ts`.
 *
 * These cases hold the artifact to the tree it claims to describe. A witness is a *name*,
 * and a name is the one thing a rename invalidates without touching a single number --
 * which is exactly the shape this campaign files as "a published claim nothing reads".
 *
 * Two different things are held here, and the split between them is the point. **Coverage
 * and ownership** are static facts and are asserted: every claim has a name, and a name
 * belongs to the file that makes the claim. **Whether the name still matches a test** is
 * not statically checkable in this tree (the cases say why), and it is not a silent
 * failure either: the aim misses, the claim is measured against the whole file, and the
 * battery prints how many missed.
 */
describe('the witness behind each claim', () => {
  it('names a test for every claim the table prices, and nothing that is not a name', () => {
    // Every claim, not most of them: the table is written by a run that measured all of
    // them, so a claim without a witness is a claim still priced as a whole file -- which
    // is the 45% the round removed coming back one file at a time.
    const byFile = byFileOf();
    const table = shipped();
    let named = 0;
    for (const [file, claims] of byFile) {
      const row = (table.files as Record<string, any>)[file];
      for (const claim of claims) {
        const witness = row?.witnesses?.[claim.site];
        expect(typeof witness, `${claim.site} of ${file}`).toBe('string');
        // A name and not a paragraph: `-t` takes one pattern, and an empty one matches
        // every test in the file -- an aim that believes it is aimed.
        expect(String(witness).trim(), claim.site).not.toBe('');
        expect(String(witness), claim.site).not.toContain('\n');
        expect(String(witness).length).toBeLessThan(300);
        named += 1;
      }
    }
    expect(named).toBe(256);
  });

  // What this file cannot check, and why it is not checked badly instead.
  //
  // The obvious case here is "the name is one the claimant's source contains", and it was
  // written first. **It is impossible for two shapes in this tree**, measured: a title
  // with a quote in it is written `it('... the repository\'s')`, so the report's title and
  // the source's literal differ by the escape; and a title built from a template
  // (`it(\`prints '${word}' ...\`)`) appears nowhere in the source at all. A case that
  // asserted the literal membership would fail on those two and be right about nothing.
  //
  // So staleness is held where it is observable: the battery aims each run at its
  // witness, and a name that has stopped existing makes that run miss -- which it reports
  // (`N aim(s) missed and were measured against the whole file instead`) and which costs a
  // whole-file run rather than a wrong verdict. `verify-sites-are-sensitive.test.ts` has
  // that path end to end, including the count.

  it('names a site its own claimant makes, and no other file does', () => {
    // The witness is filed under the site, and the site is what the run arms. A row under
    // a site this file does not claim is a row the battery would never consult -- an
    // artifact half of which nothing reads.
    const byFile = byFileOf();
    const table = shipped();
    const owner = new Map<string, string>();
    for (const [file, claims] of byFile) for (const claim of claims) owner.set(claim.site, file);
    let rows = 0;
    for (const [file, row] of Object.entries(table.files as Record<string, any>)) {
      for (const site of Object.keys((row as any).witnesses ?? {})) {
        expect(owner.get(site), site).toBe(file);
        rows += 1;
      }
    }
    expect(rows).toBeGreaterThan(200);
  });
});
