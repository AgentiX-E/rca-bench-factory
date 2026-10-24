import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The reconcile tool: which successful runs never made it into the record.
 *
 * `readings.json` is written by hand, from a workflow artefact, by whoever read the number. That
 * is the one step in the sequence with nothing behind it — the digest gate catches an unmeasured
 * prompt (finding 226) and the anti-regression rule catches a measured worse one (finding 227),
 * but **a run that happened and was not written down is caught by neither.** That is not
 * hypothetical: run `39950191377` produced 24/30 and sat unread for twenty hours while four
 * rounds were written on top of "blocked" (finding 222).
 *
 * The tool needs the network, so it is a script and these tests drive it over a saved API
 * payload. What is asserted is the decision, not the HTTP: a successful run is accounted for if
 * its id is a reading **or** an `absent` entry, a failed run is not asked for, and anything
 * unaccounted for is named and fails.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'reconcile-readings.mjs');

/**
 * The scripts this file drives.
 *
 * Declared because `gate-sites-are-proven` cross-checks two accounts: the sites this script owns
 * (both of them are failure exits) and the tests that spawn it. A test that spawns a script
 * without declaring it is a proof nobody can trace back from the inventory, and the two records
 * disagreeing is the state that check exists to prevent.
 */
const DRIVES = ['scripts/reconcile-readings.mjs'];

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reconcile-readings-'));
  dirs.push(dir);
  return dir;
}

/** A record with one reading and one absent run, which is the shape the real file has. */
function recordWith(runs: number[], absent: number[] = []): string {
  const path = join(workspace(), 'readings.json');
  writeFileSync(
    path,
    JSON.stringify({
      schema: 'rca-bench-fault-extraction-readings/1',
      readings: runs.map((run) => ({ run, status: 'current', totals: { strict: 1 } })),
      absent: absent.map((run) => ({ run, why: 'the artefact was not kept, so it is named rather than reconstructed' })),
    }),
  );
  return path;
}

/** An API payload as `GET /actions/workflows/<wf>/runs` returns it, reduced to what matters. */
function runsPayload(entries: Array<{ id: number; conclusion: string }>): string {
  const path = join(workspace(), 'runs.json');
  writeFileSync(
    path,
    JSON.stringify({
      total_count: entries.length,
      workflow_runs: entries.map((entry) => ({
        id: entry.id,
        conclusion: entry.conclusion,
        created_at: '2026-10-24T00:00:00Z',
        head_sha: 'abcdef0123456789',
        html_url: `https://example.invalid/${String(entry.id)}`,
      })),
    }),
  );
  return path;
}

function run(args: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('scripts/reconcile-readings.mjs · a successful run with no record entry', () => {
  it('passes when every successful run is a reading or an absent entry', () => {
    const readings = recordWith([1001], [1002]);
    const runs = runsPayload([
      { id: 1001, conclusion: 'success' },
      { id: 1002, conclusion: 'success' },
    ]);
    const result = run(['--runs', runs, '--readings', readings]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('reconcile-readings: OK');
    expect(result.out).toContain('2 successful run(s) since id 1001');
  });

  it('names an unrecorded run and fails, rather than reporting a total', () => {
    // The case that matters: 24/30 was measured, nobody wrote it down, and four rounds were
    // written on top of a document that said the measurement was blocked.
    const readings = recordWith([1001]);
    const runs = runsPayload([
      { id: 1001, conclusion: 'success' },
      { id: 2002, conclusion: 'success' },
    ]);
    const result = run(['--runs', runs, '--readings', readings]);
    expect(result.status).toBe(3);
    expect(result.out).toContain('UNRECORDED 2002');
    expect(result.out).toContain('2026-10-24T00:00:00Z');
    expect(result.out).toContain('abcdef01');
    expect(result.out).toContain('add the reading with its totals and promptDigest');
  });

  it('does not ask for a record entry for a failed run, which has no numbers', () => {
    // A `402` run is exactly when the record is least interesting, and a tool that cried wolf
    // there would be switched off before the case that matters arrived.
    const readings = recordWith([1001]);
    const runs = runsPayload([
      { id: 1001, conclusion: 'success' },
      { id: 3003, conclusion: 'failure' },
      { id: 3004, conclusion: 'cancelled' },
    ]);
    const result = run(['--runs', runs, '--readings', readings]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).not.toContain('3003');
    expect(result.out).not.toContain('3004');
  });

  it('leaves runs that predate the record out of scope, because the record did not exist then', () => {
    // Run ids increase with creation time, so the smallest recorded id is the boundary: anything
    // below it is history, anything at or above it must be accounted for. Without this the tool
    // reports every success since September and becomes noise -- and a noisy guard is a guard
    // that gets switched off.
    const readings = recordWith([5005]);
    const runs = runsPayload([
      { id: 100, conclusion: 'success' },
      { id: 5005, conclusion: 'success' },
      { id: 5006, conclusion: 'success' },
    ]);
    const result = run(['--runs', runs, '--readings', readings]);
    expect(result.status).toBe(3);
    expect(result.out).toContain('UNRECORDED 5006');
    expect(result.out).not.toContain('UNRECORDED 100');
    expect(result.out).toContain('since id 5005');
  });

  it('refuses a payload that is not the API shape, instead of reading it as "no runs"', () => {
    // An empty result and an unreadable input are different findings. A tool that returned
    // "0 unrecorded" for `{}` would be the defect it exists to catch, one level up.
    const readings = recordWith([1001]);
    const broken = join(workspace(), 'broken.json');
    writeFileSync(broken, JSON.stringify({ items: [] }));
    const result = run(['--runs', broken, '--readings', readings]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('no `workflow_runs` array');
  });

  it('says which way to fix an unrecorded run, including the route for a lost artefact', () => {
    // The message is the instruction. `absent` is a real route -- run 39806875985 uses it -- and
    // a tool that only said "record it" would push a reader toward inventing numbers.
    const readings = recordWith([]);
    const runs = runsPayload([{ id: 4004, conclusion: 'success' }]);
    const result = run(['--runs', runs, '--readings', readings]);
    expect(result.status).toBe(3);
    expect(result.out).toContain('name it in `absent`');
  });
});
