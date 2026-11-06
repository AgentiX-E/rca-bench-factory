import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
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

  it('divides the sorted claimants by position, with no file in two shards', () => {
    // Cannot produce: a claimant that is slower on one runner than another. The split is
    // by file name and not by measured cost, so a slow file stays in the shard it was
    // assigned and the two shards can be reasoned about without a run.
    const byFile = [
      ['a.test.ts', [{ site: 'a:1' }, { site: 'a:2' }]],
      ['b.test.ts', [{ site: 'b:1' }]],
      ['c.test.ts', [{ site: 'c:1' }]],
      ['d.test.ts', [{ site: 'd:1' }]],
      ['e.test.ts', [{ site: 'e:1' }]],
    ] as unknown as ReturnType<typeof claimsByFile>;
    const first = shardClaims(byFile, 1, 2);
    const second = shardClaims(byFile, 2, 2);
    expect(first.map(([file]) => file)).toEqual(['a.test.ts', 'c.test.ts', 'e.test.ts']);
    expect(second.map(([file]) => file)).toEqual(['b.test.ts', 'd.test.ts']);
    const sites = [...first, ...second].flatMap(([, claims]) => claims.map((claim) => claim.site));
    expect(sites.sort()).toEqual(['a:1', 'a:2', 'b:1', 'c:1', 'd:1', 'e:1'].sort());
    expect(shardClaims(byFile, 1, 6).length).toBe(1);
    expect(shardClaims(byFile, 6, 6).length).toBe(0);
  });
});

describe('the shards ci.yml actually calls', () => {
  it('measure every proved claim exactly once, in two different jobs', () => {
    // Cannot produce: the wall-clock of either job. The inventory and the workflow are
    // files; the claim is that the partition of the first is complete in the second.
    const plan = planOf();
    expect(plan.errors).toEqual([]);
    expect(plan.calls).toBe(2);
    expect(checkShardPlan(byFileOf(), plan.specs)).toEqual([]);
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
    expect(checkShardPlan(byFile, [first]).join('\n')).toContain('is not called');
    expect(checkShardPlan(byFile, [first, first]).join('\n')).toContain('is called 2 times');
    expect(
      checkShardPlan(byFile, [first, { ...second, job: first.job }]).join('\n'),
    ).toContain('two shards');
    expect(
      checkShardPlan(byFile, [first, { ...second, count: first.count + 1 }]).join('\n'),
    ).toContain('disagree');
    expect(checkShardPlan(byFile, []).join('\n')).toContain('no call');
    expect(
      checkShardPlan(byFile, [{ job: 'only', index: 1, count: 1 }]).join('\n'),
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
    const env = { ...process.env };
    // The gate resolves its inventory and its claimants from `process.cwd()`. A suite run
    // from `packages/core` would otherwise look for `packages/core/golden-master`, and
    // the refusal would be about a directory rather than about the shipped inventory.
    const all = spawnSync(process.execPath, [GATE, '--list'], { encoding: 'utf8', env, cwd: ROOT });
    expect(all.status).toBe(0);
    const whole = all.stdout.trim().split('\n').filter(Boolean).sort();
    expect(whole.length).toBeGreaterThan(10);
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
      env: { ...process.env },
      cwd: ROOT,
    });
    expect(one.status).toBe(1);
    expect(one.stderr).toContain('holds no claimant');
    expect(one.stdout).toBe('');
  });
});
