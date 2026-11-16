import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildLogtsCsv } from '../src/export/rcaeval-logts.js';

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

/**
 * The budget this file's suite is given, in milliseconds.
 *
 * ## The reading, taken before this constant existed
 *
 * Every test here spawns the gate, and one of them builds a corpus of 4 500 000 cells
 * and then runs it through a 96 MB heap, so the file is a sum of process starts plus one
 * large write. Measured over ten full-suite runs on the tree before this constant
 * existed, on a box whose cgroup allows 4 CPUs:
 *
 *     2 workers   1 509 / 1 223 / 1 229 ms     green
 *     4 workers   1 274 / 1 460 / 1 260 ms     green
 *     6 workers   2 300 / 2 617 ms             green, 52% of the 5 000 ms default
 *     8 workers   2 709 / 3 135 ms             green, 63% of it
 *
 * It never went red. The row that puts it in this table is the one above it at 6 -- 52%
 * of an inherited budget is the shape three sibling files were carrying when they did go
 * red at 8 -- and the budget is the estate's tightest declaration, 30 000 ms.
 */
const SUITE_BUDGET_MS = 30_000;

const LOGS_HEADER = 'time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template';

/** The same file without the column the corpus groups by, which `RE2-SS` ships. */
const LOGS_HEADER_NO_ID = 'time,timestamp,container_name,message,level,req_path,error,log_template';

/**
 * The seven columns `RE2-SS` and `RE2-TT` actually ship: no id, no rendered text.
 *
 * The pair is what makes 246 of the corpus's 271 directories unreadable to the exact
 * rule -- and, since v3.93, the shape the marginal inequality is asked about instead.
 */
const LOGS_HEADER_MESSAGE_ONLY = 'time,timestamp,container_name,message,level,req_path,error';

/** One log line in the seven-column shape, carrying only what the inequality counts. */
function logLineMessageOnly(seconds: number, container: string): string {
  return `00:00,${at(seconds)},${container},message,info,,`;
}

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

/**
 * One log line, carrying both columns the corpus's own file carries.
 *
 * The id is a parameter rather than a constant because the corpus's is: a fixture
 * that filed a `frontend` line under the `currencyservice` cluster would be a case
 * whose two columns disagree, and every test below would then be measuring the
 * fallback path without saying so.
 */
function logLine(seconds: number, container: string, template: string, clusterId = '1'): string {
  return `00:00,${at(seconds)},${container},message,info,,,${clusterId},${template}`;
}

/** The same line in a file that has no `cluster_id` column, as `RE2-SS` ships it. */
function logLineNoId(seconds: number, container: string, template: string): string {
  return `00:00,${at(seconds)},${container},message,info,,,${template}`;
}

const LOGS = [
  LOGS_HEADER,
  logLine(0, 'currencyservice', 'conversion request successful', '1'),
  logLine(0, 'currencyservice', 'conversion request successful', '1'),
  logLine(0, 'frontend', 'request started', '2'),
  logLine(15, 'frontend', 'request started', '2'),
].join('\n');

const LOGTS = ['time,currencyservice_1,frontend_2', '0,2,1', '15,0,1'].join('\n');

function run(...argv: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('check-aggregate-tables · the gate', { timeout: SUITE_BUDGET_MS }, () => {
  it('reports the cell count when the reduction reproduces the corpus', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': LOGTS,
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('2 row(s) x 2 column(s) = 4 cell(s), all equal');
    expect(out).toContain('check-aggregate-tables: OK (1 case(s) reproduced, 4 cell(s)');
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

  it('asks the inequality of a file that carries only time, container and message', () => {
    // `RE2-SS` and `RE2-TT` ship exactly these four columns in the corpus, and with no
    // id and no rendered text there is nothing to count a row into a *cluster* with.
    // Until v3.93 that made the case a refusal, and a refusal is silent about the
    // corpus. The container is still there, so the one statement the shape supports is
    // that the published table cannot hold more lines than the container emitted.
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': `time,timestamp,container_name,message\n00:00,${at(0)},frontend,request started`,
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain(': bounded -- 1 (container, bucket) pair(s)');
    expect(out).toContain('0 spare row(s) at the tightest');
    expect(status).toBe(0);
  });

  it('refuses a case it cannot even place on the grid, and names the column', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': 'time,container_name,cluster_id,log_template\n00:00,frontend,2,request started',
      'logts.csv': LOGTS,
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("no 'timestamp' column, so a row cannot be placed on the grid");
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
    expect(out).toContain('1 log row(s) name no cluster and appear in no column');
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
    expect(out).toContain('OK (2 case(s) reproduced, 8 cell(s)');
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

  /**
   * A table the size of a SockShop case, in a heap that could not hold two copies of it.
   *
   * ## The measurement this case is
   *
   * On the 2026-11-13 `rcaeval-re2` run, 270 of 270 cases round-tripped with
   * `oracle=1.00` and this gate then died:
   *
   *     FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed --
   *     JavaScript heap out of memory
   *     Process completed with exit code 134
   *
   * after ninety Online Boutique cases, on the first SockShop one (finding 529). It held
   * the table four times -- two texts and two parse trees -- and then re-read and
   * re-parsed the published file twice more to print a row and column count.
   *
   * The fixture below is 3000 buckets by 1500 cluster keys: 4 500 000 cells, 9 MB as
   * text. Measured against the two shapes of the script on this machine:
   *
   *     --max-old-space-size=96   old: heap out of memory   new: OK, 4 500 000 cells
   *
   * so the heap bound is the whole assertion. The corpus file is produced by the
   * repository's own reducer, which is what makes this a fixture about *size* rather
   * than about a hand-written table -- and the case is deleted afterwards because a
   * 30 MB directory per run is not something a test should leave behind.
   */
  it('compares four and a half million cells inside a heap that cannot hold two copies', () => {
    const buckets = 3000;
    const keys = 1500;
    const dir = mkdtempSync(join(tmpdir(), 'aggregate-wide-'));
    try {
      const clusters: { key: string; container: string; template: string }[] = [];
      for (let key = 1; key <= keys; key += 1) {
        clusters.push({ key: String(key), container: 'a', template: 't' });
      }
      // One row per cluster at each end: every column is 1, the table is full width,
      // and the log file names each row's own cluster -- which is what the corpus's
      // `cluster_id` column does. A fixture that left the id off would be a file the
      // gate reads through its fallback, and this test would then be measuring the
      // narrow path.
      const wide = clusters.flatMap((one) => [
        { container: 'a', template: 't', atSeconds: 0, clusterId: one.key },
        { container: 'a', template: 't', atSeconds: (buckets - 1) * 15, clusterId: one.key },
      ]);
      const table = buildLogtsCsv(wide, clusters);
      writeFileSync(
        join(dir, 'cluster_info.json'),
        JSON.stringify(
          Object.fromEntries(clusters.map((one) => [one.key, { template: one.template, container: [one.container] }])),
        ),
      );
      writeFileSync(
        join(dir, 'logs.csv'),
        [LOGS_HEADER, ...wide.map((row) => logLine(row.atSeconds, row.container, row.template, row.clusterId))].join(
          '\n',
        ),
      );
      writeFileSync(join(dir, 'logts.csv'), table.csv);

      const result = spawnSync(
        process.execPath,
        ['--max-old-space-size=96', SCRIPT, '--case', dir],
        { encoding: 'utf8' },
      );
      const out = `${result.stdout}${result.stderr}`;
      expect(out).toContain(`${buckets} row(s) x ${keys} column(s) = ${buckets * keys} cell(s), all equal`);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * A refusal is an outcome, and the difference between the two outcomes is the step.
   *
   * ## Why this is not the same test as the three refusals above
   *
   * Each of those invokes the gate on **one** case, so "refused" and "nothing was
   * compared" are the same run and both must fail. On the corpus they are not: of the
   * 181 case directories in `RE2-OB`, `RE2-SS` and `RE2-TT`, **24** carry a
   * `cluster_id` column and can be reproduced; the other 157 ship a `message`-only
   * log against Drain's masked templates, and no id, which this rule cannot reduce.
   * Counting those as failures makes the step red for a property of the corpus
   * rather than a defect in this repository, which is what it did until v3.90 -- and
   * what made its title ("either reproduced or refused") untrue of its behaviour.
   */
  it('counts a bounded case beside a reproduced one, and keeps the two numbers apart', () => {
    const root = mkdtempSync(join(tmpdir(), 'aggregate-mixed-'));
    dirs.push(root);
    const good = join(root, 'RE2-OB/checkoutservice_cpu/1');
    const masked = join(root, 'RE2-TT/ts-train-service_socket/2');
    mkdirSync(good, { recursive: true });
    mkdirSync(masked, { recursive: true });
    writeFileSync(join(good, 'cluster_info.json'), JSON.stringify(CLUSTERS));
    writeFileSync(join(good, 'logs.csv'), LOGS);
    writeFileSync(join(good, 'logts.csv'), LOGTS);
    // The shape `RE2-SS` and `RE2-TT` actually ship: seven columns, no id and no
    // rendered template. Four rows whose container/bucket marginals equal the
    // published table's, which is the strongest thing this shape can be asked.
    writeFileSync(join(masked, 'cluster_info.json'), JSON.stringify(CLUSTERS));
    writeFileSync(
      join(masked, 'logs.csv'),
      [
        LOGS_HEADER_MESSAGE_ONLY,
        logLineMessageOnly(0, 'currencyservice'),
        logLineMessageOnly(0, 'currencyservice'),
        logLineMessageOnly(0, 'frontend'),
        logLineMessageOnly(15, 'frontend'),
      ].join('\n'),
    );
    writeFileSync(join(masked, 'logts.csv'), LOGTS);

    const { status, out } = run('--official-dir', root);
    expect(out).toContain('RE2-TT/ts-train-service_socket/2: bounded -- ');
    expect(out).toContain(
      'OK (1 case(s) reproduced, 4 cell(s) reduced from logs.csv and equal to the corpus\'s own logts.csv; ' +
        '4 row(s) counted by their own cluster id, 0 named two different clusters; ' +
        '1 case(s) bounded, not reproduced: the marginals of logts.csv hold no more log cell(s) than ' +
        'logs.csv has rows for that container, 3 (container, bucket) pair(s), 0 spare row(s) at the tightest ' +
        'over 4 published cell(s) against 4 log row(s))',
    );
    expect(status).toBe(0);
  });

  /**
   * The weak claim has its own name, and it can pass on its own.
   *
   * The 246 corpus directories this applies to cannot be *reproduced* -- their logs
   * carry neither a cluster id nor a rendered template -- so a gate that only knew
   * "reproduced" had to count them as refusals, and a refusal says nothing about the
   * corpus. What can be said about them is an inequality, and a statement that can
   * only be true is not a check: this one fails when the corpus publishes more log
   * cells in a bucket than the container has rows in it.
   */
  it('passes a case on the inequality alone, while saying it was not reproduced', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [
        LOGS_HEADER_MESSAGE_ONLY,
        logLineMessageOnly(0, 'currencyservice'),
        logLineMessageOnly(0, 'frontend'),
        logLineMessageOnly(0, 'frontend'),
      ].join('\n'),
      // One cell against two rows, so the assertion is about the bound rather than
      // about equality.
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('bounded -- ');
    expect(out).toContain('1 (container, bucket) pair(s), 1 spare row(s) at the tightest');
    expect(out).toContain('0 case(s) reproduced');
    expect(status).toBe(0);
  });

  /**
   * A bucket holds every row of its fifteen seconds, not the rows of its first second.
   *
   * ## The measurement that produced this fixture
   *
   * The 2026-11-15 `Official data` run (`43735099650`, step 13) took the weak claim to the
   * corpus for the first time, and **246 of 246** directories came back over the bound:
   * `RE2-OB/checkoutservice_cpu/2` had `cartservice` publishing 131 log cells in bucket
   * `1708474635` against `0` log rows, and its totals agreed to within the rows no cluster
   * names (110 047 cells against 110 067 rows). A gate that disagrees with every case it
   * is pointed at is not measuring the corpus.
   *
   * The clock was the defect. Rows arrive at arbitrary instants -- `1708474643` is inside
   * the bucket that starts at `1708474635` -- and the log side was keyed by the second
   * the row fell on while the published side is keyed by the bucket. Every fixture before
   * this one wrote its rows at `0`, `15`, `30`, which are both the bucket and the second,
   * so the two clocks agreed for the only reason a fixture can: it was shaped like the
   * implementation (finding 545).
   */
  it('counts a row at any second of a bucket into that bucket', () => {
    // Six rows inside one fifteen-second window, and a published table that says so.
    // A log side keyed by the second sees exactly one of them.
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [
        LOGS_HEADER_MESSAGE_ONLY,
        ...[0, 1, 2, 3, 4, 5].map((second) => logLineMessageOnly(second, 'frontend')),
      ].join('\n'),
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,6'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('0 spare row(s) at the tightest');
    expect(out).not.toContain('cannot count more lines than the file holds');
    expect(status).toBe(0);
  });

  it('places the last second of a bucket in it, and the first second of the next in the next', () => {
    // `14` and `15` straddle the boundary. A table keyed by the second finds no row at
    // either: the first is filed under `14` and the published bucket is `0`.
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [
        LOGS_HEADER_MESSAGE_ONLY,
        logLineMessageOnly(14, 'frontend'),
        logLineMessageOnly(15, 'frontend'),
        logLineMessageOnly(15, 'frontend'),
      ].join('\n'),
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,1', '15,0,2'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('2 (container, bucket) pair(s), 0 spare row(s) at the tightest');
    expect(status).toBe(0);
  });

  /**
   * The inequality is the gate: a table cannot summarize more lines than the file holds.
   *
   * This is the direction that makes the claim falsifiable. The corpus could publish a
   * table whose marginals exceed its own log rows only by summarizing a different file,
   * by bucketing on a different clock, or by double-counting -- and each of those is a
   * defect this repository would otherwise inherit as "the corpus says so".
   */
  it('fails when a published marginal counts more log cells than the container has rows', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [
        LOGS_HEADER_MESSAGE_ONLY,
        logLineMessageOnly(0, 'frontend'),
        logLineMessageOnly(0, 'frontend'),
      ].join('\n'),
      // Three cells in a bucket that holds two rows.
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,3'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain(
      "container 'frontend' in bucket 0 publishes 3 log cell(s) and logs.csv holds 2 row(s) for it",
    );
    expect(out).toContain('a table that summarizes a log file cannot count more lines than the file holds');
    expect(out).toContain('FAILED');
    expect(status).toBe(1);
  });

  /**
   * A column name nobody can read is a refusal, not a container named `frontend_notanumber`.
   *
   * The inequality needs one thing from `logts.csv` that the corpus does not state
   * anywhere else: which container a column belongs to. The spelling is
   * `<container>_<cluster key>` with the key a decimal integer, so a column that does
   * not end in `_<digits>` is a table this rule cannot attribute -- and reading its
   * container off the left of the last underscore would be a guess about a file whose
   * whole purpose is to be compared with.
   */
  /**
   * A table whose time column is not on the grid is not a table this rule can compare.
   *
   * The inequality compares per-window totals: the log side floors every instant to a
   * fifteen-second window, and the published side is keyed by whatever its time column
   * says. A table written on another origin therefore has no row that can be compared
   * with any window, and the breach it produces -- "publishes 131 cells, holds 0 rows"
   * -- is a true sentence about a comparison that should not have been made. That is
   * finding 545's shape one step upstream, and the answer is a refusal that names the
   * grid rather than a breach that names the numbers.
   */
  it('refuses a table whose time column is not on the fifteen-second grid', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [LOGS_HEADER_MESSAGE_ONLY, logLineMessageOnly(0, 'frontend')].join('\n'),
      // A table written on an origin seven seconds off the grid the reduction uses.
      'logts.csv': ['time,currencyservice_1,frontend_2', '7,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('its time column reads 7, which is not on the 15-second grid');
    expect(out).toContain('would be answered with cells the log file never fills');
    expect(out).toContain('0 of 1 case(s) could be reproduced or bounded, which is not a pass');
    expect(status).toBe(1);
  });

  /**
   * The refusal is about the grid, not about the numbers, and this is the fixture that
   * keeps it from being over-broad: a table one window away is on the grid, so it is
   * compared, and the comparison fails on its numbers -- which is the right verdict for
   * a table that really does disagree.
   */
  it('still compares a table that is on the grid and one window away', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [LOGS_HEADER_MESSAGE_ONLY, logLineMessageOnly(0, 'frontend')].join('\n'),
      'logts.csv': ['time,currencyservice_1,frontend_2', '15,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("container 'frontend' in bucket 15 publishes 1 log cell(s) and logs.csv holds 0 row(s)");
    expect(out).not.toContain('not on the 15-second grid');
    expect(status).toBe(1);
  });

  it('refuses a published column that does not name a container and a key', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [LOGS_HEADER_MESSAGE_ONLY, logLineMessageOnly(0, 'frontend')].join('\n'),
      'logts.csv': ['time,frontend_notanumber', '0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("'frontend_notanumber' is not '<container>_<cluster key>'");
    expect(out).toContain('0 of 1 case(s) could be reproduced or bounded, which is not a pass');
    expect(status).toBe(1);
  });

  /**
   * The column the corpus groups by, which is not the column this rule used to read.
   *
   * ## The measurement behind this fixture
   *
   * On the 2026-11-13 `rcaeval-re2` run the gate reproduced 20 of the 24 Online
   * Boutique cases and disagreed on four -- all four `_loss` cases -- by 37, 6, 3 and
   * 12 cells. None of those four is wrong in the corpus: a few of its rows carry a
   * Drain-**masked** template (`... for product <:*:> rpc error ...`) while their
   * `cluster_id` column names the cluster perfectly well, so a rule that matched
   * only the rendered text dropped rows the corpus had counted (finding 536).
   *
   * This fixture is that shape at its smallest: one row whose template is masked and
   * whose id is not, in a table that counts it. The old rule produced 1 and the
   * corpus says 2.
   */
  it('reproduces a case whose row carries a masked template, because the id is the column', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [
        LOGS_HEADER,
        logLine(0, 'frontend', 'request started', '2'),
        logLine(0, 'frontend', '<:*:> masked beyond recognition', '2'),
      ].join('\n'),
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,2'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('1 row(s) x 2 column(s) = 2 cell(s), all equal');
    expect(out).toContain(
      '1 of 2 row(s) counted by id carried a template that matches no key -- a masked template, ' +
        'not a different cluster',
    );
    expect(status).toBe(0);
  });

  it('reproduces a case with no id column, by the rendered template', () => {
    // The fallback has to be exercised on its own: every other fixture here carries
    // both columns, so a reducer that ignored the template entirely would pass them.
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': [LOGS_HEADER_NO_ID, logLineNoId(0, 'frontend', 'request started')].join('\n'),
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('1 row(s) x 2 column(s) = 2 cell(s), all equal');
    expect(out).toContain('0 row(s) counted by their own cluster id, 1 by their rendered template');
    expect(status).toBe(0);
  });

  /**
   * The case where the two columns disagree with each other.
   *
   * `cluster_id` and `log_template` are two statements about the same row. Every one
   * of the 24 corpus cases has them agree on every row, so the gate can afford to
   * treat a disagreement as a defect -- and it must, because otherwise "which column
   * wins" is a decision this repository made for the corpus rather than learned from
   * it.
   */
  it('fails when a row names one cluster by id and another by its template', () => {
    // Two clusters of the *same* container, so that both columns resolve and the
    // disagreement is between two columns rather than between a column and nothing.
    const twoFrontendKeys = {
      ...CLUSTERS,
      '3': { template: 'serving product page', container: ['frontend'] },
    };
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(twoFrontendKeys),
      'logs.csv': [
        LOGS_HEADER,
        logLine(0, 'frontend', 'serving product page', '2'),
        logLine(0, 'frontend', 'request started', '2'),
      ].join('\n'),
      'logts.csv': ['time,currencyservice_1,frontend_2,frontend_3', '0,0,2,0'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain("1 row(s) name one cluster by 'cluster_id' and a different one by 'log_template'");
    expect(out).toContain('all equal, but 1 problem(s) remain');
    expect(status).toBe(1);
  });

  /**
   * The header is read before the body, and the corpus is 202 MB wide.
   *
   * `RE2-TT/ts-train-service_socket/2/logs.csv` is 202 258 338 bytes in 274 621
   * records. Until v3.90 the gate read it whole, parsed it into 274 621 objects, and
   * then looked at the header to discover that the file has no `log_template` column
   * -- the only thing it wanted. The first TrainTicket case took the process past a
   * 4 GB heap and the step never reported a verdict at all (finding 533).
   *
   * The fixture below is 16 MB of a shape whose *published* table already says the
   * reduction cannot be attempted, in a 64 MB heap. The 64 KiB header of the log file
   * and the 64 KiB header of `logts.csv` answer it; reading either body would need
   * several times the file.
   */
  it('refuses a case without reading past its headers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aggregate-wide-refused-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'cluster_info.json'), JSON.stringify(CLUSTERS));
    // A column whose name does not end in `_<digits>`, so the inequality has no
    // container to attribute it to -- and that is decided from the header.
    writeFileSync(join(dir, 'logts.csv'), ['time,frontend_notanumber', '0,1'].join('\n'));
    const filler = '00:00,1705595459012034902,frontend,request started,,,\n';
    const records = Math.ceil((16 * 1024 * 1024) / filler.length);
    writeFileSync(
      join(dir, 'logs.csv'),
      `time,timestamp,container_name,message,level,req_path,error\n${filler.repeat(records)}`,
    );

    const result = spawnSync(process.execPath, ['--max-old-space-size=64', SCRIPT, '--case', dir], {
      encoding: 'utf8',
    });
    const out = `${result.stdout}${result.stderr}`;
    expect(out).toContain("'frontend_notanumber' is not '<container>_<cluster key>'");
    expect(out).toContain('its columns are time, frontend_notanumber');
    // One case, refused, so nothing was reproduced or bounded: this is still not a pass.
    expect(out).toContain('0 of 1 case(s) could be reproduced or bounded, which is not a pass');
    expect(result.status).toBe(1);
    rmSync(join(dir, 'logs.csv'), { force: true });
  });

  /**
   * A quarter of a million rows is a count, not a table.
   *
   * The reduction is a fold: `reduceLogts` keeps one entry per (bucket, column) that
   * was observed, so a log file with many records in few buckets costs the buckets
   * and not the records. The fixture is 200 000 records of 9 columns -- about 20 MB --
   * reduced into a 4-row table inside a 64 MB heap, which is less than the row
   * objects alone would take.
   */
  it('reduces two hundred thousand rows in a heap that could not hold the rows', () => {
    const buckets = 4;
    const dir = mkdtempSync(join(tmpdir(), 'aggregate-tall-'));
    try {
      writeFileSync(join(dir, 'cluster_info.json'), JSON.stringify(CLUSTERS));
      const records = 200_000;
      const lines = [LOGS_HEADER];
      for (let index = 0; index < records; index += 1) {
        lines.push(logLine((index % buckets) * 15, 'currencyservice', 'conversion request successful'));
      }
      writeFileSync(join(dir, 'logs.csv'), lines.join('\n'));
      const perBucket = records / buckets;
      writeFileSync(
        join(dir, 'logts.csv'),
        [
          'time,currencyservice_1,frontend_2',
          ...[0, 15, 30, 45].map((second) => `${second},${perBucket},0`),
        ].join('\n'),
      );

      const result = spawnSync(process.execPath, ['--max-old-space-size=64', SCRIPT, '--case', dir], {
        encoding: 'utf8',
      });
      const out = `${result.stdout}${result.stderr}`;
      expect(out).toContain(`4 row(s) x 2 column(s) = 8 cell(s), all equal`);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The sentence on the failing path, which used to lie.
   *
   * A case with one wrong cell printed "… = 4 cell(s), all equal" and then failed,
   * because the line was emitted whenever the comparison had counted cells and nobody
   * had asked it whether any of them differed. A reader skimming the log of a red run
   * met the disagreement and the claim that there was none in the same line.
   */
  it('says how many cells differ rather than saying they are all equal', () => {
    const dir = makeCase({
      'cluster_info.json': JSON.stringify(CLUSTERS),
      'logs.csv': LOGS,
      'logts.csv': ['time,currencyservice_1,frontend_2', '0,3,1', '15,0,1'].join('\n'),
    });
    const { status, out } = run('--case', dir);
    expect(out).toContain('2 row(s) x 2 column(s) = 4 cell(s), 1 differ');
    expect(out).not.toContain('all equal');
    // The last line counts cells and cases, not sentences: one differing cell in one
    // case reports two sentences ("time=0 …" and "… further cell(s) differ") and the
    // run that said "21 problem(s)" over 58 cells named a number nobody could act on
    // (finding 537).
    expect(out).toContain('FAILED (1 cell(s) differ across 1 case(s); 1 problem(s) reported)');
    expect(status).toBe(1);
  });
});

