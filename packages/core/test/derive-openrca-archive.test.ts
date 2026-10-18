import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseCsvObjects, renderCsv } from '../src/util/csv.js';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement in
 * either direction.
 */
const DRIVES = ['scripts/derive-openrca-archive.mjs'];

/**
 * `scripts/derive-openrca-archive.mjs`.
 *
 * The script turns four released CSVs into `golden-master/openrca-archive.json`,
 * which `openrca-archive-replay.test.ts` replays. Two things about it cannot be
 * checked by reading the committed corpus:
 *
 *  1. **The exclusion rule.** A row is dropped when it declares two roots across
 *     three criterion kinds, and the corpus records *how many* were dropped. A
 *     derivation whose exclusion silently widened would leave a corpus that says
 *     `42` while covering less -- and nothing in the replay would notice, because
 *     the replay only reads the cases that are there. The synthetic archive below
 *     contains one row of each shape, so both exclusion branches are executed and
 *     their labels are asserted.
 *  2. **Both failure exits.** `--check` against a stale file and the missing
 *     `--archive` argument are the only two ways the script can fail, and a guard
 *     that is never observed failing is the defect finding 121 was written about.
 *
 * The synthetic archive is built with `renderCsv`, so the quoting is the
 * repository's own: the cells below carry embedded newlines and doubled quotes,
 * which is what the real files do and what a hand-written fixture would get wrong.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'derive-openrca-archive.mjs');

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rca-archive-'));
  dirs.push(dir);
  return dir;
}

/** The four suite names the script requires, with the same table in each. */
const SUITES = ['Bank', 'Market-cloudbed-1', 'Market-cloudbed-2', 'Telecom'];

const HEADER = ['instruction', 'prediction', 'passed', 'failed', 'score', 'row_id', 'task_index', 'groundtruth'];

function prediction(roots: Array<Record<string, string>>): string {
  const body: Record<string, Record<string, string>> = {};
  roots.forEach((root, index) => {
    body[String(index + 1)] = root;
  });
  return JSON.stringify(body);
}

/**
 * Four rows, one per shape the derivation has to tell apart.
 *
 * `row_id` values are the ones a reader would see in the archive; the assertion
 * messages name them so a failure reads as "the two-root row on task_7 was
 * placed" rather than as a count.
 */
const ROWS = [
  [
    'component only',
    prediction([{ 'root cause component': 'Tomcat01', 'root cause reason': 'network packet loss' }]),
    'Tomcat01',
    '',
    1,
    'a-single-kind',
    'task_3',
    'level: pod\ncomponent: Tomcat01\nreason: network packet loss',
  ],
  [
    'two roots, one kind',
    prediction([
      { 'root cause occurrence datetime': '2021-03-07 16:07:00', 'root cause component': 'MG01' },
      { 'root cause occurrence datetime': '2021-03-07 16:30:00', 'root cause component': 'MG02' },
    ]),
    '2021-03-07 16:08:00',
    '2021-03-07 16:29:00',
    0.5,
    'b-two-roots-one-kind',
    'task_1',
    'level: pod\ncomponent: MG01\ndatetime: 2021-03-07 16:08:00\nreason: network latency',
  ],
  [
    'three kinds, one root',
    prediction([
      {
        'root cause occurrence datetime': '2021-03-10 15:00:00',
        'root cause component': 'apache01',
        'root cause reason': 'network latency',
      },
    ]),
    '2021-03-10 15:00:00\napache01\nnetwork latency',
    '',
    1,
    'c-three-kinds-one-root',
    'task_7',
    'level: pod\ncomponent: apache01\ndatetime: 2021-03-10 15:00:00\nreason: network latency',
  ],
  [
    'three kinds, two roots',
    prediction([
      { 'root cause component': 'IG01', 'root cause reason': 'high CPU usage' },
      { 'root cause component': 'IG02', 'root cause reason': 'high CPU usage' },
    ]),
    'IG01',
    'IG02',
    0.5,
    'd-three-kinds-two-roots',
    'task_7',
    'level: pod\ncomponent: IG01\nreason: high CPU usage',
  ],
  [
    'the key is wider than the row',
    prediction([{ 'root cause component': 'Tomcat04', 'root cause reason': 'network latency' }]),
    'Tomcat04',
    '2021-03-23 23:04:00',
    0.5,
    'e-key-wider',
    'task_7',
    'level: pod\ncomponent: Tomcat04\nreason: network latency',
  ],
] as const;

function writeArchive(rows: readonly (readonly (string | number)[])[]): string {
  const dir = scratch();
  for (const suite of SUITES) {
    const body = suite === 'Bank' ? renderCsv(HEADER, rows as unknown as (string | number)[][]) : renderCsv(HEADER, []);
    writeFileSync(join(dir, `agent-${suite}.csv`), body);
  }
  return dir;
}

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/derive-openrca-archive.mjs', () => {
  it('places one-kind rows, reads the answer-key row, and refuses the two that cannot be placed', () => {
    const archive = writeArchive(ROWS);
    const out = join(scratch(), 'corpus.json');

    const derived = run(['--archive', archive, '--out', out]);
    expect(derived.stderr).toBe('');
    expect(derived.status).toBe(0);

    const corpus = JSON.parse(readFileSync(out, 'utf8')) as {
      schema: string;
      cases: Array<{ rowId: string; basis: string; criteria: Record<string, string[]>; predicted: unknown[] }>;
      replayable: { cases: number; twoRootPredicted: number; byTask: Record<string, number> };
      excluded: { cases: number; byBasis: Record<string, number>; byTask: Record<string, number> };
      twoRootRowsInArchive: number;
      upstream: { commit: string; files: Array<{ path: string; rows: number; twoRootRows: number }> };
    };

    expect(corpus.schema).toBe('rca-bench-archive-replay/1');
    expect(corpus.upstream.commit).toMatch(/^[0-9a-f]{40}$/);

    // One-kind placement comes from the task index alone.
    const singleKind = corpus.cases.find((one) => one.rowId === 'a-single-kind')!;
    expect(singleKind.basis).toBe('single-kind-task');
    expect(singleKind.criteria).toEqual({ components: ['Tomcat01'] });

    // Two roots on a one-kind task: both criteria land in that kind, which is
    // what makes the matching rule reachable from a row that names two roots.
    const twoRoots = corpus.cases.find((one) => one.rowId === 'b-two-roots-one-kind')!;
    expect(twoRoots.basis).toBe('single-kind-task');
    expect(twoRoots.predicted).toHaveLength(2);
    expect(twoRoots.criteria.times).toEqual(['2021-03-07 16:08:00', '2021-03-07 16:29:00']);

    // Three kinds with one root: the placement is read from the `groundtruth`
    // cell, and the derivation requires it to be exactly the recovered set.
    const threeKinds = corpus.cases.find((one) => one.rowId === 'c-three-kinds-one-root')!;
    expect(threeKinds.basis).toBe('answer-key-row');
    expect(threeKinds.criteria).toEqual({
      components: ['apache01'],
      reasons: ['network latency'],
      times: ['2021-03-10 15:00:00'],
    });

    // The two refusals, by name: one because the second root's values have no
    // kind, one because the answer key names a criterion the row did not score.
    expect(corpus.replayable.cases).toBe(3);
    expect(corpus.excluded.cases).toBe(2);
    expect(corpus.excluded.byBasis).toEqual({ 'key-wider-than-one-root': 1, 'two-roots-three-kinds': 1 });
    expect(corpus.excluded.byTask).toEqual({ task_7: 2 });

    // The multi-root population is counted over every row, including the ones
    // that were excluded -- otherwise the exemption would shrink the denominator
    // of the very number it exists to report.
    expect(corpus.twoRootRowsInArchive).toBe(2);
    expect(corpus.replayable.twoRootPredicted).toBe(1);
    expect(corpus.upstream.files.find((file) => file.path === 'rca/archive/agent-Bank.csv')!.rows).toBe(5);
  });

  it('writes digests of the bytes it read, so a corpus can be tied to one tree', () => {
    const archive = writeArchive(ROWS);
    const out = join(scratch(), 'corpus.json');
    expect(run(['--archive', archive, '--out', out]).status).toBe(0);

    const corpus = JSON.parse(readFileSync(out, 'utf8')) as {
      upstream: { files: Array<{ path: string; bytes: number; sha256: string }> };
    };
    const bank = corpus.upstream.files.find((file) => file.path === 'rca/archive/agent-Bank.csv')!;
    const bytes = readFileSync(join(archive, 'agent-Bank.csv'));
    expect(bank.bytes).toBe(bytes.length);
    expect(bank.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('succeeds on --check against what it just wrote, and fails against anything else', () => {
    const archive = writeArchive(ROWS);
    const out = join(scratch(), 'corpus.json');
    expect(run(['--archive', archive, '--out', out]).status).toBe(0);

    const current = run(['--archive', archive, '--out', out, '--check']);
    expect(current.status).toBe(0);
    expect(current.stdout).toContain('is current');

    writeFileSync(out, '{}\n');
    const stale = run(['--archive', archive, '--out', out, '--check']);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('is stale');

    // A missing file is a stale one, not a crash: `--check` has to be usable on a
    // tree that has never derived the corpus.
    const absent = join(scratch(), 'absent.json');
    const missing = run(['--archive', archive, '--out', absent, '--check']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('does not exist');
  });

  it('refuses to guess without an archive, and says how to supply one', () => {
    const usage = run([]);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('--archive <dir>');

    const dangling = join(scratch(), 'nothing-here');
    const absent = run(['--archive', dangling, '--out', join(scratch(), 'x.json')]);
    expect(absent.status).not.toBe(0);
    expect(absent.stderr).toContain('missing');
  });

  it('reads the shipped corpus the same way the replay does', () => {
    // The committed corpus and this synthetic one go through the same reader, so
    // a change to `parseCsvObjects` that broke embedded newlines would move both.
    // Asserting the committed file loads and holds its own arithmetic keeps the
    // two derivations from drifting apart without either failing.
    const committed = JSON.parse(
      readFileSync(resolve(ROOT, 'golden-master', 'openrca-archive.json'), 'utf8'),
    ) as { cases: unknown[]; excluded: { cases: number }; upstream: { files: Array<{ rows: number }> } };
    const rows = committed.upstream.files.reduce((sum, file) => sum + file.rows, 0);
    expect(committed.cases.length + committed.excluded.cases).toBe(rows);

    // And the reader agrees with the file about a cell that carries newlines: a
    // fixture round-trip, parsed the way the script parses the archive.
    const csv = renderCsv(HEADER, [ROWS[2] as unknown as (string | number)[]]);
    expect(parseCsvObjects(csv)[0]!.passed).toBe('2021-03-10 15:00:00\napache01\nnetwork latency');
  });
});
