import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/gen-rcaeval-cases.mjs` derives `--cases` descriptors from an
 * extracted upstream corpus.
 *
 * The script exists so nobody transcribes the labels by hand, which means the
 * failure it has to rule out is a *plausible* descriptor rather than a crash.
 * A descriptor that names a component the telemetry never mentions does not
 * fail the ingest -- it produces a bundle with an answer key nobody can score,
 * and the round trip then reports on data it silently mislabelled.
 *
 * Every case below is therefore about a label or a timestamp being wrong, not
 * about the script erroring.
 *
 * The corpus is built here rather than downloaded, so the assertions are about
 * the derivation alone and the suite runs without the network.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'gen-rcaeval-cases.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * `spawnSync`, not `execFileSync`, so a *successful* run's stderr is readable.
 *
 * The skipped-directory warnings are printed on a run that exits 0, and
 * `execFileSync` returns stdout alone -- the warnings arrive only via the
 * exception object, which a zero exit never produces. Asserting on diagnosis the
 * harness cannot see is how a test passes while the message it names is missing.
 */
function run(args: string[]): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-cases-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A case written in the corpus's own layout, `{suite}-{system}/{service}_{fault}/{run}`.
 *
 * The nesting is not decoration. It is the whole reason this script failed
 * against the real download: the previous helper wrote `RE2-ob-cpu_1` as a
 * single flat directory, which is the name our *exporter* emits, so the
 * derivation was tested only against the layout it would never be given. The
 * corpus looks like this, and a fixture that does not look like this cannot
 * fail the way the corpus did.
 */
function caseDir(root: string, suiteSystem: string, serviceFault: string, run: string, seconds = 1_700_000_000): void {
  const dir = join(root, suiteSystem, serviceFault, run);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'inject_time.txt'), `${seconds}\n`);
}

/** A fresh corpus root, so one test's directories cannot leak into another's. */
function corpus(): string {
  counter += 1;
  const root = join(scratch, `corpus-${counter}`);
  mkdirSync(root, { recursive: true });
  return root;
}

describe('scripts/gen-rcaeval-cases.mjs · the derivation', () => {
  it('recovers a service whose name contains hyphens', () => {
    // The reason `parseRcaEvalDirectory` is imported rather than re-implemented.
    // `ts-order-service` is Train Ticket's spelling and splitting on the first
    // `-` after the suite yields `ts`, which is not a service.
    const root = corpus();
    caseDir(root, 'RE2-TT', 'ts-order-service_cpu', '1');
    const out = join(scratch, `hyphen-${counter}.json`);
    const result = run(['--official-dir', root, '--out', out]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0].component).toBe('ts-order-service');
    expect(parsed.cases[0].faultType).toBe('cpu');
  });

  it('converts the recorded Unix seconds into a canonical UTC instant', () => {
    // A locale-dependent rendering would shift the observation window by hours
    // and every signal would fall outside it -- while still looking like a time.
    const root = corpus();
    caseDir(root, 'RE1-OB', 'carts_cpu', '1', 1_700_000_000);
    const out = join(scratch, `time-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.cases[0].injectTime).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(parsed.cases[0].injectTime).toMatch(/Z$/);
  });

  it('routes each case by its own directory prefix, so cases cannot share files', () => {
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '2');
    const out = join(scratch, `prefix-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    const prefixes = parsed.cases.map((c: { pathPrefix: string }) => c.pathPrefix);
    expect(prefixes).toEqual(['RE2-OB/checkoutservice_cpu/1/', 'RE2-OB/checkoutservice_cpu/2/']);
  });

  it('classifies each case into its suite and counts them per suite', () => {
    const root = corpus();
    caseDir(root, 'RE1-OB', 'carts_cpu', '1');
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '2');
    caseDir(root, 'RE3-TT', 'ts-order-service_f1', '1');
    const out = join(scratch, `suites-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.counts).toEqual({ RE1: 1, RE2: 2, RE3: 1 });
    expect(parsed.cases.map((c: { suite: string }) => c.suite)).toEqual(['RE1', 'RE2', 'RE2', 'RE3']);
  });

  it('orders cases by id so two runs of the same corpus are byte-identical', () => {
    // The output is committed and compared, so a directory-order dependency
    // would make the check fail on a machine that enumerated in another order.
    const root = corpus();
    caseDir(root, 'RE2-TT', 'zzz_cpu', '1');
    caseDir(root, 'RE2-OB', 'aaa_cpu', '1');
    caseDir(root, 'RE1-SS', 'mmm_cpu', '1');
    const out = join(scratch, `order-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const ids = JSON.parse(readFileSync(out, 'utf8')).cases.map((c: { caseId: string }) => c.caseId);
    expect(ids).toEqual([...ids].sort());
  });

  it('labels a case by the corpus path, not by a re-rendering of it', () => {
    // The ingest keys the bundle on this id and the round trip matches it back
    // against the directory it read. A re-rendered id would be well-formed and
    // point at the wrong case, which is the failure mode with no symptom.
    const root = corpus();
    caseDir(root, 'RE2-TT', 'ts-order-service_cpu', '2');
    const out = join(scratch, `id-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.cases[0].caseId).toBe('RE2-TT/ts-order-service_cpu/2');
    expect(parsed.cases[0].pathPrefix).toBe('RE2-TT/ts-order-service_cpu/2/');
    expect(parsed.cases[0].component).toBe('ts-order-service');
    expect(parsed.cases[0].faultType).toBe('cpu');
  });

  it('walks to the depth a case occurs at and no further', () => {
    // The walk used to descend without a bound, testing each directory *name*
    // against the flat pattern. That could match a directory which is not a
    // case, and it could descend into a real case looking for one below it.
    // A case is now a leaf holding `inject_time.txt` three levels down, so
    // anything deeper is not a case and must not be reported as one.
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    // One level too deep: the same shape as a case, under a run directory
    // rather than under a `{service}_{fault}` one. The bounded walk never looks
    // here, which is what keeps a stray `inject_time.txt` inside a case from
    // being reported as a second case.
    const tooDeep = join(root, 'RE2-OB', 'checkoutservice_cpu', '1', 'nested', '2');
    mkdirSync(tooDeep, { recursive: true });
    writeFileSync(join(tooDeep, 'inject_time.txt'), '1700000000\n');
    const out = join(scratch, `depth-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0].caseId).toBe('RE2-OB/checkoutservice_cpu/1');
  });
});

describe('scripts/gen-rcaeval-cases.mjs · what it refuses to guess', () => {
  it('does not treat a directory holding no inject_time.txt as a case', () => {
    // `inject_time.txt` is now what identifies a case, not the directory name,
    // so a run directory that lacks one is simply not a case rather than a
    // malformed one. That is the correct reading for this corpus: the archives
    // ship directories that look like runs and are not, and the previous
    // name-based walk reported each of them as a skipped case.
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    mkdirSync(join(root, 'RE2-OB', 'checkoutservice_cpu', '2'), { recursive: true });
    const out = join(scratch, `noinject-${counter}.json`);
    const result = run(['--official-dir', root, '--out', out]);
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8')).cases).toHaveLength(1);
    expect(result.stderr).not.toContain('RE2-OB/checkoutservice_cpu/2');
  });

  it('skips a non-numeric inject_time.txt rather than emitting NaN', () => {
    const root = corpus();
    const dir = join(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), 'not a timestamp\n');
    const out = join(scratch, `nan-${counter}.json`);
    const result = run(['--official-dir', root, '--out', out]);
    // A NaN instant would serialise as `null` and the ingest would reject the
    // descriptor for a reason that names neither the file nor the value.
    expect(result.stderr).toContain('not a number');
  });

  it('skips a path whose head does not carry the suite and system', () => {
    // The head component is where the suite lives, and a head that does not
    // carry it cannot be assigned to a suite. Reporting it as unclassified would
    // be worse than skipping it: the round trip would score it under a suite it
    // was never measured against.
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    caseDir(root, 'unlabelled', 'checkoutservice_cpu', '1');
    const out = join(scratch, `layout-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0].caseId).toBe('RE2-OB/checkoutservice_cpu/1');
  });

  it('fails when the corpus holds no case directories at all', () => {
    // An empty corpus and a corpus of unreadable names are the same finding:
    // the round trip has nothing to run, and reporting success would let it
    // pass by scoring zero cases.
    const root = corpus();
    const out = join(scratch, `empty-${counter}.json`);
    const result = run(['--official-dir', root, '--out', out]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no RCAEval case directories/);
  });

  it('names the fetch command when the corpus directory is absent', () => {
    const result = run(['--official-dir', join(scratch, 'absent'), '--out', join(scratch, 'x.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fetch-official.mjs');
  });

  it('requires --official-dir rather than reading a default location', () => {
    const result = run(['--out', join(scratch, 'x.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--official-dir is required/);
  });

  it('rejects a flag with no value instead of reading the next flag as one', () => {
    const result = run(['--official-dir', '--out']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--official-dir requires a value/);
  });
});

describe('scripts/gen-rcaeval-cases.mjs · --check', () => {
  it('accepts a file that matches the corpus', () => {
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    const out = join(scratch, `check-ok-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    const result = run(['--official-dir', root, '--out', out, '--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Cases match/);
  });

  it('refuses a file that has drifted from the corpus', () => {
    // This is the guarantee that makes the committed descriptor file meaningful:
    // a corpus that gains a case without the committed list gaining one is a
    // round trip that silently scores a subset.
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    const out = join(scratch, `check-drift-${counter}.json`);
    expect(run(['--official-dir', root, '--out', out]).status).toBe(0);
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '2');
    const result = run(['--official-dir', root, '--out', out, '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/out of date/);
  });

  it('refuses to check a file that does not exist', () => {
    const root = corpus();
    caseDir(root, 'RE2-OB', 'checkoutservice_cpu', '1');
    const result = run(['--official-dir', root, '--out', join(scratch, 'absent.json'), '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not exist/);
  });
});
