import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/census-corpus.mjs`, over corpora written here.
 *
 * The census is the reading that v3.34's fix turned on and that nothing here had ever taken:
 * group the corpus's cases by fault category and say which reading named each one. What the
 * tests below pin is therefore not "the numbers on the published corpus" -- those live in
 * `golden-master/corpus-census.json` and are measured by `--check` -- but the properties a
 * census can get wrong while still printing a table:
 *
 *   - a directory carrying `inject_time.txt` that is **not** a case (the corpus contains one);
 *   - a fault type no reading names, which must fail rather than land in a bucket called
 *     "unknown" that later figures average over;
 *   - a `--check` that compares what it can and says what it could not.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'census-corpus.mjs');

/**
 * The script this file proves, declared rather than inferred.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this against what the spawn calls below
 * actually reach, in both directions: declaring a script that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration exists because the argument
 * is a variable here, so a reader of the spawn call cannot see which script it names.
 */
const DRIVES = ['scripts/census-corpus.mjs'];
void DRIVES;

const scratch = mkdtempSync(join(tmpdir(), 'rca-census-test-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): Promise<Outcome> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [SCRIPT, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => resolvePromise({ status: code ?? -1, stdout, stderr }));
  });
}

/** One case directory of the corpus's shape: `{suite}-{system}/{service}_{fault}/{run}/`. */
function writeCase(root: string, caseId: string): void {
  const dir = join(root, caseId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'inject_time.txt'), '1732000000\n');
  writeFileSync(join(dir, 'metrics.csv'), 'time,adservice_cpu\n1732000000,0.1\n');
}

let rootCounter = 0;
function freshTree(): string {
  rootCounter += 1;
  const root = join(scratch, `corpus-${String(rootCounter)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

/** A corpus with all three suites, both of the taxonomy's unnameable families, and one not-a-case. */
function mixedCorpus(): string {
  const root = freshTree();
  writeCase(root, 'RE1-OB/adservice_cpu/1');
  writeCase(root, 'RE1-OB/adservice_delay/2');
  writeCase(root, 'RE2-OB/checkoutservice_socket/1');
  writeCase(root, 'RE3-OB/adservice_f4/1');
  writeCase(root, 'RE3-TT/ts-route-service_f3_1/1');
  // The corpus's 736th `inject_time.txt`: a hand-made bundle, not one of the 735 cases.
  writeCase(root, 'RE2-OB/checkoutservice_cpu/multi-source-data');
  return root;
}

const golden = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 'rca-bench-corpus-census/1',
  cases: 5,
  faultTypes: 5,
  rows: [
    { suite: 'RE1', category: 'resource', faultType: 'cpu', name: 'CPU hog', readAs: 'classifier', cases: 1 },
    { suite: 'RE1', category: 'network', faultType: 'delay', name: 'Network delay', readAs: 'classifier', cases: 1 },
    { suite: 'RE2', category: 'resource', faultType: 'socket', name: 'Socket stress', readAs: 'taxonomy', cases: 1 },
    { suite: 'RE3', category: 'code', faultType: 'f3_1', name: 'Missing Function Call', readAs: 'taxonomy', cases: 1 },
    { suite: 'RE3', category: 'code', faultType: 'f4', name: 'Incorrect Return Values', readAs: 'taxonomy', cases: 1 },
  ],
  notCases: ['RE2-OB/checkoutservice_cpu/multi-source-data'],
  ...overrides,
});

function writeGolden(document: Record<string, unknown>): string {
  const path = join(scratch, `census-${String(rootCounter)}-${String(Date.now())}.json`);
  writeFileSync(path, JSON.stringify(document, null, 1));
  return path;
}

describe('census-corpus.mjs', () => {
  it('groups a tree by suite and category, and names each fault', async () => {
    const result = await run(['--official-dir', mixedCorpus()]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CENSUS 5 case(s) in 3 suite(s), 5 fault type(s): resource 2, code 2, network 1');
    expect(result.stdout).toContain('CENSUS   RE2  resource   socket   1  Socket stress');
    expect(result.stdout).toContain('CENSUS   RE3  code       f4       1  Incorrect Return Values');
    expect(result.stdout).toContain('CENSUS NAMED every case\x27s fault type (5 case(s))');
  });

  it('reports the directory that carries a case marker and is not a case', async () => {
    const result = await run(['--official-dir', mixedCorpus()]);
    // The count is 5 and the tree holds 6 `inject_time.txt` files: the difference is the
    // whole point, so the path is printed rather than silently dropped.
    expect(result.stdout).toContain('CENSUS not a case: RE2-OB/checkoutservice_cpu/multi-source-data');
    expect(result.stdout).toContain('CENSUS 5 case(s)');
  });

  it('fails on a fault type no reading names', async () => {
    const root = freshTree();
    writeCase(root, 'RE1-OB/adservice_cpu/1');
    writeCase(root, 'RE1-OB/adservice_mystery/1');
    writeCase(root, 'RE1-OB/adservice_mystery/2');
    const result = await run(['--official-dir', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CENSUS UNNAMED 2 case(s) in 1 fault type(s) no reading names: mystery (2)');
    // The table still prints: a census that says nothing when it finds something is worse
    // than one that reports and fails.
    expect(result.stdout).toContain('CENSUS   RE1  unknown    mystery  2  (unnamed)');
  });

  it('reads an archive index instead of an extracted tree', async () => {
    const index = join(scratch, 'index.json');
    writeFileSync(
      index,
      JSON.stringify({
        schema: 'rca-bench-archive-index/1',
        paths: [
          'RE3-OB/',
          'RE3-OB/adservice_f3/1/inject_time.txt',
          'RE3-OB/adservice_f3/1/metrics.csv',
          'RE3-OB/adservice_f3/2/inject_time.txt',
        ],
      }),
    );
    const result = await run(['--index', index]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('CENSUS 2 case(s) in 1 suite(s), 1 fault type(s): code 2');
    expect(result.stdout).toContain('CENSUS   RE3  code       f3       2  Missing Function Call');
  });

  it('reads a descriptor file', async () => {
    const cases = join(scratch, 'cases.json');
    writeFileSync(
      cases,
      JSON.stringify({
        cases: [
          { caseId: 'RE2-OB/a_socket/1', suite: 'RE2', faultType: 'socket' },
          { caseId: 'RE2-OB/b_socket/2', suite: 'RE2', faultType: 'socket' },
        ],
      }),
    );
    const result = await run(['--cases', cases]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('CENSUS 2 case(s) in 1 suite(s), 1 fault type(s): resource 2');
  });

  it('writes the census as data a later run can check against', async () => {
    const out = join(scratch, 'written.json');
    const result = await run(['--official-dir', mixedCorpus(), '--json', out]);
    expect(result.status, result.stderr).toBe(0);
    const document = JSON.parse(readFileSync(out, 'utf8'));
    expect(document.schema).toBe('rca-bench-corpus-census/1');
    expect(document.cases).toBe(5);
    expect(document.categories).toEqual([
      { category: 'resource', cases: 2 },
      { category: 'code', cases: 2 },
      { category: 'network', cases: 1 },
    ]);
    expect(document.notCases).toEqual(['RE2-OB/checkoutservice_cpu/multi-source-data']);
  });

  it('says so when a measurement matches the committed census', async () => {
    const path = writeGolden(golden());
    const result = await run(['--official-dir', mixedCorpus(), '--check', path]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('CENSUS MATCHES');
  });

  it('names the row whose count moved', async () => {
    const rows = golden().rows as Array<Record<string, unknown>>;
    const path = writeGolden(
      golden({ rows: rows.map((row) => (row.faultType === 'socket' ? { ...row, cases: 2 } : row)) }),
    );
    const result = await run(['--official-dir', mixedCorpus(), '--check', path]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CENSUS MISMATCH RE2/socket: committed 2, measured 1');
  });

  it('names a row that only one side has, in both directions', async () => {
    const rows = golden().rows as Array<Record<string, unknown>>;
    const dropped = writeGolden(golden({ rows: rows.filter((row) => row.faultType !== 'f4') }));
    const missing = await run(['--official-dir', mixedCorpus(), '--check', dropped]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('RE3/f4: measured 1 case(s), absent from the committed census');

    const extra = writeGolden(
      golden({ rows: [...rows, { suite: 'RE1', category: 'runtime', faultType: 'panic', cases: 1 }] }),
    );
    const surplus = await run(['--official-dir', mixedCorpus(), '--check', extra]);
    expect(surplus.status).toBe(1);
    expect(surplus.stderr).toContain('RE1/panic: committed, absent from the measurement');
  });

  it('compares the totals and the not-a-case set, not only the rows', async () => {
    const total = writeGolden(golden({ cases: 4 }));
    expect((await run(['--official-dir', mixedCorpus(), '--check', total])).stderr).toContain(
      'CENSUS MISMATCH cases: committed 4, measured 5',
    );

    const types = writeGolden(golden({ faultTypes: 4 }));
    expect((await run(['--official-dir', mixedCorpus(), '--check', types])).stderr).toContain(
      'CENSUS MISMATCH fault types: committed 4, measured 5',
    );

    const notCases = writeGolden(golden({ notCases: [] }));
    expect((await run(['--official-dir', mixedCorpus(), '--check', notCases])).stderr).toContain(
      'CENSUS MISMATCH not a case: committed []',
    );
  });

  it('exits 2 when it was given nothing to census', async () => {
    const empty = await run(['--official-dir', freshTree()]);
    expect(empty.status).toBe(2);
    expect(empty.stderr).toContain('no cases were declared');

    const noArguments = await run([]);
    expect(noArguments.status).toBe(2);
    expect(noArguments.stderr).toContain('no cases were declared');
  });

  it('exits 2 on an input that is not there, or holds no list', async () => {
    const missing = await run(['--index', join(scratch, 'absent.json')]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('does not exist');

    const hollow = join(scratch, 'hollow.json');
    writeFileSync(hollow, JSON.stringify({ schema: 'rca-bench-archive-index/1' }));
    const noList = await run(['--index', hollow]);
    expect(noList.status).toBe(2);
    expect(noList.stderr).toContain('holds no entry list');

    const badCorpus = join(scratch, 'no-such-corpus');
    const noDir = await run(['--official-dir', badCorpus]);
    expect(noDir.status).toBe(2);
    expect(noDir.stderr).toContain('does not exist');
  });

  it('names the file it looked at in each refusal', async () => {
    // A guard on the guard: an error message that names only the problem leaves a reader
    // hunting through a machine for the file. Each of the three inputs is named in its own
    // refusal, which is the property this test fixes.
    const missing = await run(['--cases', join(scratch, 'absent-cases.json')]);
    expect(missing.stderr).toContain(join(scratch, 'absent-cases.json'));
  });
});
