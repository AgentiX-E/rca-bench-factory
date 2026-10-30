import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The corpus-scale proof that `logts.csv` is a reduction, driven through the gate.
 *
 * The unit tests beside this file establish the *rules*; this file establishes
 * that the gate applies them to a directory that looks like a case and that it
 * refuses the shapes it cannot read. The corpus itself never enters the
 * repository -- `check-no-vendored-data.mjs` would be right to reject it -- so the
 * real run is the one the anchor workflow takes, and the local evidence is the
 * 2910-cell run recorded in `docs/audit/volume-09.md`.
 */
/**
 * The scripts this file drives.
 *
 * Declared as well as spawned. `gate-sites-are-proven.test.ts` reconciles the two
 * signals in both directions, because either one alone is satisfiable without
 * running anything: a path spelled in a comment proves nothing, and a `spawnSync`
 * the file does not admit to is a proof nobody can find from the inventory.
 */
const DRIVES = [
  'scripts/check-aggregate-tables.mjs',
];

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '../../../scripts/check-aggregate-tables.mjs');

const LOGS_HEADER = 'time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template';

const CLUSTERS = {
  '1': { template: 'conversion request successful', container: ['currencyservice'] },
  '2': { template: 'request started', container: ['frontend'] },
};

const dirs: string[] = [];
afterEach(() => {
  dirs.length = 0;
});

function makeCase(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'aggregate-'));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

/** One nanosecond timestamp, so the fixture carries the unit the corpus uses. */
function at(seconds: number): string {
  return String(seconds * 1_000_000_000 + 123_456_789);
}

function logLine(seconds: number, container: string, template: string): string {
  return `00:00,${at(seconds)},${container},message,info,,,1,${template}`;
}

const LOGS = [
  LOGS_HEADER,
  logLine(0, 'currencyservice', 'conversion request successful'),
  logLine(0, 'currencyservice', 'conversion request successful'),
  logLine(0, 'frontend', 'request started'),
  logLine(15, 'frontend', 'request started'),
].join('\n');

const LOGTS = ['time,currencyservice_1,frontend_2', '0,2,1', '15,0,1'].join('\n');

function run(...argv: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('check-aggregate-tables · the gate', () => {
  it('reports the cell count when the reduction reproduces the corpus', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': LOGTS,
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('2 row(s) x 2 column(s) = 4 cell(s), all equal');
    expect(out).toContain('check-aggregate-tables: OK (1 case(s), 4 cell(s)');
    expect(status).toBe(0);
  });

  it('names the cell when the published table disagrees with the reduction', () => {
    // One cell, one count: the failure has to say which coordinate is wrong,
    // because a 2910-cell comparison that reported "not equal" would be a number
    // nobody could act on.
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,3,1', '15,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("time=0 column='currencyservice_1' published=3 reduced=2");
    expect(out).toContain('FAILED');
    expect(status).toBe(1);
  });

  it('refuses a column order it cannot reproduce, and says what the rule is', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': ['time,frontend_2,currencyservice_1', '0,1,2', '15,1,0'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('the column rule is <container>_<cluster key> ordered by the key as an integer');
    expect(status).toBe(1);
  });

  it('refuses a length it cannot reproduce, and says the grid is dense', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,2,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('the grid is every 15 seconds from the first log to the last, with no gaps');
    expect(status).toBe(1);
  });

  it('refuses a case whose logts.csv has no cluster table beside it', () => {
    // The column names come from `cluster_info.json` and from nowhere else, so a
    // missing table is an unanswerable question rather than an empty one.
    const dir = makeCase({ 'logs.csv': LOGS, 'logts.csv': LOGTS });
    const { status, out } = run('--case', dir);
    expect(out).toContain('logts.csv is present and cluster_info.json is not');
    expect(status).toBe(1);
  });

  it('refuses a cluster table it cannot read, rather than skipping it', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify({ '1': { template: 'x', container: [] } }),
      'logs.csv': LOGS,
      'logts.csv': LOGTS,
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("cluster '1' has no non-empty 'container' array");
    expect(status).toBe(1);
  });

  it('refuses a case whose logs.csv is missing a column the reduction needs', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': 'time,timestamp,container_name\n00:00,1,frontend',
      'logts.csv': LOGTS,
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("no 'log_template' column");
    expect(status).toBe(1);
  });

  it('notes the two tables it does not produce, without failing on them', () => {
    // Their presence is not a defect in the corpus; their *absence from this
    // repository* is a claim, and this line is where a reader meets it.
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': LOGTS,
      'tracets_lat.csv': 'time,currencyservice_Convert\n0,5\n',
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('tracets_lat.csv is present and is not produced by this repository');
    expect(out).toContain('seven candidate reductions, 0 of 1649 cells');
    expect(status).toBe(0);
  });

  it('counts the log lines no cluster describes, instead of filing them', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': `${LOGS}\n${logLine(0, 'redis', '')}`,
      'logts.csv': LOGTS,
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('1 log row(s) match no cluster and appear in no column');
    expect(status).toBe(0);
  });

  it('finds every case under a corpus root and adds the cells up', () => {
    const root = mkdtempSync(join(tmpdir(), 'aggregate-root-'));
    dirs.push(root);
    for (const leaf of ['RE2-OB/checkoutservice_cpu/1', 'RE2-OB/checkoutservice_cpu/2']) {
      const dir = join(root, leaf);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'cluster_info.json'), JSON.stringify(CLUSTERS));
      writeFileSync(join(dir, 'logs.csv'), LOGS);
      writeFileSync(join(dir, 'logts.csv'), LOGTS);
    }
    // A directory with no logts.csv is not a case, and walking past it must not
    // stop the walk: the corpus has plenty of those.
    mkdirSync(join(root, 'RE2-OB/checkoutservice_cpu/multi-source-data'), { recursive: true });

    const { status, out } = run('--official-dir', root);
    expect(out).toContain('RE2-OB/checkoutservice_cpu/1: 2 row(s) x 2 column(s) = 4 cell(s), all equal');
    expect(out).toContain('RE2-OB/checkoutservice_cpu/2: 2 row(s) x 2 column(s) = 4 cell(s), all equal');
    expect(out).toContain('OK (2 case(s), 8 cell(s)');
    expect(status).toBe(0);
  });

  it('refuses a corpus root that holds no logts.csv at all', () => {
    // "Nothing to check" and "everything checks out" print the same number of
    // failures, which is why this is an exit rather than an empty summary.
    const root = mkdtempSync(join(tmpdir(), 'aggregate-empty-'));
    dirs.push(root);
    const { status, out } = run('--official-dir', root);
    expect(out).toContain('holds no logts.csv, so nothing was checked and this is not a pass');
    expect(status).toBe(1);
  });

  it('refuses an invocation that names neither a case nor a root', () => {
    const { status, out } = run();
    expect(out).toContain('one of --case or --official-dir is required');
    expect(status).toBe(1);
  });

  it('refuses a path that is not there, rather than reporting no problems', () => {
    const { status, out } = run('--case', join(tmpdir(), 'aggregate-does-not-exist-xyz'));
    expect(out).toContain('no such directory');
    expect(status).toBe(1);
  });
});
