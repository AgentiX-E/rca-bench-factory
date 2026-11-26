import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assignShards,
  checkShardCosts,
  checkShardPlan,
  claimedSites,
  claimsByFile,
  parseShard,
  shardClaims,
} from '../../../scripts/site-proofs.mjs';
import { readWorkflow } from '../../../scripts/gate-steps.mjs';

/**
 * A split that measures everything, and only once.
 *
 * The sites battery grew to 626 seconds on a runner -- 52 seconds short of its own
 * bound -- so its claimants are divided by file across two jobs. A split is only an
 * improvement if the union of the shards is the whole inventory: a shard that was
 * forgotten, duplicated or left in the same job would make the battery report a clean
 * bill of health about a subset of itself, and no line in the summary would say so.
 *
 * These cases read the real `ci.yml` and the real inventory. They cannot produce the
 * wall-clock saving of running two jobs at once, and they cannot produce a claimant
 * that hangs on a runner; what they hold is the partition, which is the only part of a
 * split that a fixture can be wrong about without anybody noticing.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/verify-sites-are-sensitive.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = join(ROOT, 'scripts', 'verify-sites-are-sensitive.mjs');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml');
const INVENTORY = join(ROOT, 'golden-master', 'gate-sites.json');

/**
 * A cost table for the spawned cases that need one but are not about one.
 *
 * The assignment it implies is by count -- every claimant priced the same -- which is
 * enough for "an index past the file count holds nobody" and keeps the case from
 * depending on a measurement taken on another day.
 */
function flatTable(): string {
  const where = join(SNAPSHOTS, 'flat-costs.json');
  const files = Object.fromEntries(
    byFileOf().map(([file, claims]) => [
      file,
      { claims: claims.length, runs: claims.length + 1, baselineMs: 1000, mutantMs: 1000 },
    ]),
  );
  writeFileSync(
    where,
    JSON.stringify(
      {
        measured: '2026-01-01',
        machine: 'the case',
        source: 'node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json',
        files,
      },
      null,
      2,
    ),
    'utf8',
  );
  return where;
}

/** One file, read by every call this file makes, so the question is the partition. */
const SNAPSHOTS = mkdtempSync(join(tmpdir(), 'rca-shard-plan-'));
afterAll(() => rmSync(SNAPSHOTS, { recursive: true, force: true }));

/** One call in `ci.yml`, reduced to the three facts the partition is argued from. */
interface Spec {
  job: string;
  index: number;
  count: number;
}

/**
 * The shards the shipped workflow actually calls, read by the real workflow reader.
 *
 * A call without `--shard` is not silently treated as `1/1`: `--list` and local runs
 * legitimately have no shard, but a CI step that omits it would measure the whole
 * inventory next to the shards and answer every claim twice.
 */
function planOf(): { calls: number; specs: Spec[]; errors: string[] } {
  const workflow = readWorkflow(readFileSync(WORKFLOW, 'utf8'));
  expect(workflow.errors).toEqual([]);
  const calls = workflow.steps.filter((one) =>
    /verify-sites-are-sensitive\.mjs/.test(one.run ?? ''),
  );
  const specs: Spec[] = [];
  const errors: string[] = [];
  for (const one of calls) {
    const match = /--shard\s+(\S+)/.exec(one.run ?? '');
    if (match === null) {
      errors.push(`\`${String(one.job)} / ${String(one.name)}\` calls the battery without --shard`);
      continue;
    }
    const parsed = parseShard(match[1]);
    if (!parsed.ok) {
      errors.push(`\`${String(one.job)} / ${String(one.name)}\`: ${parsed.error}`);
      continue;
    }
    specs.push({ job: String(one.job), index: parsed.index, count: parsed.count });
  }
  return { calls: calls.length, specs, errors };
}

function byFileOf() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  return claimsByFile(claimedSites(inventory));
}

/**
 * The claimant list with every file priced the same.
 *
 * The plan verdicts below are about shape -- which shards are called, how many times,
 * from how many jobs -- and `checkShardPlan` walks the placement because it was asked
 * for one. Flat prices keep that walk from reading the shipped table: a case about the
 * plan must not be red because a measurement it does not consult is absent, which is
 * the cycle the cost table's own file exists to avoid.
 */
function flatCosts() {
  return new Map(byFileOf().map(([file]) => [file, 1]));
}

describe('the shard grammar', () => {
  it('reads a one-based i/n and refuses every shape that could measure nothing', () => {
    // Cannot produce: a runner that spends a shard's minutes. The grammar is about the
    // argument, and a bad argument is refused before any claimant is spawned.
    expect(parseShard('1/2')).toEqual({ ok: true, index: 1, count: 2 });
    expect(parseShard('2/2')).toEqual({ ok: true, index: 2, count: 2 });
    for (const bad of ['', '0/2', '3/2', '1/0', '1', 'one/two', '1/2/3', '-1/2']) {
      expect(parseShard(bad).ok).toBe(false);
    }
    expect(parseShard('3/2').ok).toBe(false);
    expect(parseShard('1/0').ok).toBe(false);
  });
});

/**
 * Five claimants, and what each has cost.
 *
 * The costs are the number the table records -- a baseline run plus one run per claim,
 * measured around each claimant's own children -- and the case below is the arithmetic
 * of placing them. A fixture rather than the real inventory for the reason every
 * arithmetic case here has one: the property has to be readable without a runner, and
 * `e` deliberately outweighs the rest so that one file decides an assignment.
 */
function fiveClaimants() {
  const one = (site: string, file: string) => [{ site, file, kind: 'exit' }];
  const byFile = [
    ['a.test.ts', one('a:1', 'a.test.ts')],
    ['b.test.ts', one('b:1', 'b.test.ts')],
    ['c.test.ts', one('c:1', 'c.test.ts')],
    ['d.test.ts', one('d:1', 'd.test.ts')],
    ['e.test.ts', one('e:1', 'e.test.ts')],
  ] as unknown as ReturnType<typeof claimsByFile>;
  const costs = new Map([
    ['a.test.ts', 100],
    ['b.test.ts', 400],
    ['c.test.ts', 100],
    ['d.test.ts', 60],
    ['e.test.ts', 500],
  ]);
  return { byFile, costs };
}

describe('the split, which is by cost rather than by position', () => {
  it('places the dearest claimant first, on whichever shard is emptiest at the time', () => {
    // Cannot produce: the seconds a runner spends. What it holds is the arithmetic --
    // `e` is 500 s of child time against four claimants under half that, so it opens
    // shard 1, `b` opens shard 2, and the two files that sort **before** `e` land in
    // shard 2 because that is where the room is. A split by sorted position would have
    // put `a` and `c` in shard 1 with `e` and called the pair even.
    const { byFile, costs } = fiveClaimants();
    const first = shardClaims(byFile, 1, 2, costs);
    const second = shardClaims(byFile, 2, 2, costs);
    expect(first.map(([file]) => file)).toEqual(['c.test.ts', 'e.test.ts']);
    expect(second.map(([file]) => file)).toEqual(['a.test.ts', 'b.test.ts', 'd.test.ts']);
    // A partition: every claimant on exactly one side, and the seconds 600 against 560.
    const sites = [...first, ...second].flatMap(([, claims]) => claims.map((claim) => claim.site));
    expect(sites.sort()).toEqual(['a:1', 'b:1', 'c:1', 'd:1', 'e:1'].sort());
    expect(assignShards(byFile, 2, costs).map((files) => files.length)).toEqual([2, 3]);
  });

  it('is a function of the table and not of the order the inventory was read in', () => {
    // The same five claimants, handed over in reverse: same partition, because the
    // assignment sorts by cost and breaks ties by name. A plan that depended on file
    // order would put a different claimant on each shard on a machine whose directory
    // read came back differently, which is the objection the positional split was
    // chosen for -- and it is answered by the table being committed, not by the split
    // being blind.
    const { byFile, costs } = fiveClaimants();
    const reversed = [...byFile].reverse();
    const forwards = assignShards(byFile, 2, costs);
    const backwards = assignShards(reversed, 2, costs);
    for (const [index, files] of forwards.entries()) {
      expect([...files].sort()).toEqual([...backwards[index]].sort());
    }
    // And it is a function: the same call twice is the same answer, which the git-diff
    // of a regenerated table depends on.
    expect(assignShards(byFile, 2, costs)).toEqual(forwards);
  });

  it('refuses a split into no shards, which would be a plan that runs nowhere', () => {
    // Reachable only through the pure function -- `parseShard` refuses a count below one
    // before the gate ever asks -- so the guard is proved here rather than by a spawn.
    const { byFile, costs } = fiveClaimants();
    expect(() => assignShards(byFile, 0, costs)).toThrow(/not a split/);
  });

  it('refuses to place a claimant the table has not measured', () => {
    // The hazard a cost-blind split could not have: a file with no entry would be
    // placed by a fallback, and a fallback is a second partition under one name --
    // `ci.yml`'s halves and a local `--shard` would stop being the same halves. The
    // gate refuses the run before this can happen (the coverage verdict below), so this
    // is the second line of defence rather than the first.
    const { byFile, costs } = fiveClaimants();
    costs.delete('c.test.ts');
    expect(() => shardClaims(byFile, 1, 2, costs)).toThrow(/no measured cost for c\.test\.ts/);
  });

});

describe('the shards ci.yml actually calls', () => {
  it('measure every proved claim exactly once, in two different jobs', () => {
    // Cannot produce: the wall-clock of either job. The inventory and the workflow are
    // files; the claim is that the partition of the first is complete in the second.
    const plan = planOf();
    expect(plan.errors).toEqual([]);
    expect(plan.calls).toBe(2);
    expect(checkShardPlan(byFileOf(), plan.specs, flatCosts())).toEqual([]);
  });

  it('refuses a plan that omits a shard, duplicates one, serialises them, or disagrees on the count', () => {
    // Cannot produce: a green CI run in which a shard was silently skipped. Each edit is
    // made to the *plan*, not to a runner, and each has its own sentence.
    const byFile = byFileOf();
    const plan = planOf();
    const [first, second] = plan.specs;
    // The sentences, not array membership: `checkShardPlan` returns full statements so
    // a reader is told which repair to make, and a substring assertion on the array
    // would be a strict-equality check that passes for no sentence at all.
    const costs = flatCosts();
    expect(checkShardPlan(byFile, [first], costs).join('\n')).toContain('is not called');
    expect(checkShardPlan(byFile, [first, first], costs).join('\n')).toContain('is called 2 times');
    expect(
      checkShardPlan(byFile, [first, { ...second, job: first.job }], costs).join('\n'),
    ).toContain('two shards');
    expect(
      checkShardPlan(byFile, [first, { ...second, count: first.count + 1 }], costs).join('\n'),
    ).toContain('disagree');
    expect(checkShardPlan(byFile, [], costs).join('\n')).toContain('no call');
    expect(
      checkShardPlan(byFile, [{ job: 'only', index: 1, count: 1 }], costs).join('\n'),
    ).toContain('not a split');
  });

  it('every shard names a different job, so the split is a real wall-clock split', () => {
    // Cannot produce: two GitHub runners. A pair of shards in one job would run one
    // after the other, which is the same 626 seconds with two names.
    const plan = planOf();
    expect(new Set(plan.specs.map((one) => one.job)).size).toBe(plan.specs.length);
    expect(plan.specs.every((one) => one.count >= 2)).toBe(true);
  });

  it('the --list of every shard is the unsharded --list, with no line twice', async () => {
    // Cannot produce: a mutant run. `--list` spawns no claimant, so what this holds is
    // that the *shipped script* partitions the shipped inventory the way the pure
    // function says it does -- not merely that the function agrees with itself.
    // The inventory is copied once and every call below reads **that** file.
    //
    // CI failed this case once with 193 lines from the three calls that scan a shard and
    // 183 from the one that scans none -- seconds apart, against the file both read. The
    // property this case is for is "the shards partition the whole list", and a partition
    // is a statement about **one** list: three independent reads of a file something else
    // may be writing is a different question, and one this test is not asking. The copy is
    // not a tolerance for a flaky subject -- it is the variable this case has to hold fixed
    // (finding 432).
    // Trimmed to fifty proved sites so the count itself says which file was read: with the
    // copy in force the whole list is fifty, and a run that ignored `RCA_SENSITIVE_INVENTORY`
    // would answer with the inventory's own count and fail here rather than pass by luck.
    const snapshot = join(SNAPSHOTS, 'gate-sites.json');
    const full = JSON.parse(readFileSync(INVENTORY, 'utf8'));
    const proved = full.sites.filter((site: { status?: string }) => site.status === 'proved').slice(0, 50);
    const sliced = { ...full, sites: proved, throws: { ...full.throws, rows: [] } };
    writeFileSync(snapshot, JSON.stringify(sliced, null, 2), 'utf8');
    // A shard is only derivable from a cost table that describes the inventory it is
    // dividing, so the fifty-site copy comes with its own table -- one row per file the
    // slice still claims, at a cost that makes the split deliberately uneven (the file
    // making the most claims is priced highest) so a positional fallback would show.
    const slicedFiles = claimsByFile(claimedSites(sliced));
    const table = {
      measured: '2026-01-01',
      machine: 'the case',
      source: 'node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json',
      files: Object.fromEntries(
        slicedFiles.map(([file, claims]) => [
          file,
          { claims: claims.length, runs: claims.length + 1, baselineMs: 1000, mutantMs: claims.length * 1000 },
        ]),
      ),
    };
    const costsPath = join(SNAPSHOTS, 'sensitivity-costs.json');
    writeFileSync(costsPath, JSON.stringify(table, null, 2), 'utf8');
    const env = {
      ...process.env,
      RCA_SENSITIVE_INVENTORY: snapshot,
      RCA_SENSITIVE_COSTS: costsPath,
    };
    // The gate resolves its claimants from `process.cwd()`. A suite run from
    // `packages/core` would otherwise look for `packages/core/packages`, and the refusal
    // would be about a directory rather than about the shipped inventory.
    const all = spawnSync(process.execPath, [GATE, '--list'], { encoding: 'utf8', env, cwd: ROOT });
    expect(all.status).toBe(0);
    const whole = all.stdout.trim().split('\n').filter(Boolean).sort();
    expect(whole.length).toBe(50);
    const parts: string[] = [];
    for (const spec of planOf().specs) {
      const one = spawnSync(process.execPath, [GATE, '--list', '--shard', `${spec.index}/${spec.count}`], {
        encoding: 'utf8',
        env,
        cwd: ROOT,
      });
      expect(one.status).toBe(0);
      parts.push(...one.stdout.trim().split('\n').filter(Boolean));
    }
    expect(parts.sort()).toEqual(whole);
  });

  it('refuses a shard it cannot derive, rather than falling back to a second split', () => {
    // The table is what makes the two jobs' halves the same halves on every machine, so
    // a shard run without one has no plan to follow. Refused rather than divided by
    // position: a fallback would be a second partition under one name, and the halves
    // `ci.yml` runs would stop being the halves this file checks.
    const one = spawnSync(process.execPath, [GATE, '--list', '--shard', '1/2'], {
      encoding: 'utf8',
      env: { ...process.env, RCA_SENSITIVE_COSTS: join(SNAPSHOTS, 'no-such-costs.json') },
      cwd: ROOT,
    });
    expect(one.status).toBe(1);
    expect(one.stderr).toContain('sensitivity-costs.json');
    expect(one.stdout).toBe('');
  });

  it('refuses a table that has gone stale, before a claimant is spawned', () => {
    // A claimant added to the inventory and not to the table would be placed by nothing
    // at all -- the gate cannot tell whether the new file belongs to this shard -- so
    // the run stops while reading, with the command that regenerates the table.
    const stale = join(SNAPSHOTS, 'stale-costs.json');
    // Built from the inventory in front of this run rather than from the shipped table:
    // a case about a stale table must not itself depend on the shipped one being fresh,
    // or it would be red for the reason it is meant to describe.
    const table = {
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
    const dropped = Object.keys(table.files).sort()[0];
    delete (table.files as Record<string, unknown>)[dropped];
    writeFileSync(stale, JSON.stringify(table, null, 2), 'utf8');
    const one = spawnSync(process.execPath, [GATE, '--list', '--shard', '1/2'], {
      encoding: 'utf8',
      env: { ...process.env, RCA_SENSITIVE_COSTS: stale },
      cwd: ROOT,
    });
    expect(one.status).toBe(1);
    expect(one.stderr).toContain('does not name it');
    expect(one.stderr).toContain('--costs');
    expect(one.stdout).toBe('');
  });

  it('refuses a malformed --shard before any claimant could be spawned', () => {
    // Cannot produce: a runner that was killed by a bound. The refusal happens while
    // reading arguments, so no inventory line is printed and no child is started.
    const one = spawnSync(process.execPath, [GATE, '--list', '--shard', 'one/two'], {
      encoding: 'utf8',
      env: { ...process.env },
      cwd: ROOT,
    });
    expect(one.status).toBe(1);
    expect(one.stderr).toContain('invalid --shard');
    expect(one.stderr).toContain('usage:');
    expect(one.stdout).toBe('');
  });

  it('refuses a shard that would run no claimant, rather than passing on an empty measurement', async () => {
    // Cannot produce: a runner on which that empty shard was green. A shard index past
    // the file count is refused by the shipped script before it spawns anything.
    const one = spawnSync(process.execPath, [GATE, '--list', '--shard', '999/999'], {
      encoding: 'utf8',
      env: { ...process.env, RCA_SENSITIVE_COSTS: flatTable() },
      cwd: ROOT,
    });
    expect(one.status).toBe(1);
    expect(one.stderr).toContain('holds no claimant');
    expect(one.stdout).toBe('');
  });
});
