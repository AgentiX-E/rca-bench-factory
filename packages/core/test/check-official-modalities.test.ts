import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against the
 * scripts the spawn calls below actually reach, and reports a disagreement in either
 * direction.
 */
const DRIVES = ['scripts/check-official.mjs'];

/**
 * The log and trace tables, read as input rather than written and forgotten.
 *
 * This is a file of its own because of the stopwatch. `check-official-roundtrip.test.ts`
 * holds `test/setup/stall-watch.ts`'s per-file budget for event-loop blocking at 45 s,
 * and every `spawnSync` here blocks for the child's whole run: adding these five
 * spawns to it pushed the file to **63 759 ms** and turned a green suite into a
 * non-zero exit with no failing test -- the gauge's own failure mode, reproduced by
 * the round that was written to close a different gap. Splitting is what the gauge's
 * message advises, and it is also why a corpus contract gets its own file: the budget
 * is per file, so a contract that needs a subprocess per case needs a file to spend it
 * in.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-official.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/** `spawnSync`, so a run that exits 0 still yields its stderr. */
function run(args: string[]): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-modalities-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
function freshRoot(): string {
  counter += 1;
  const root = join(scratch, `corpus-${counter}`);
  mkdirSync(root, { recursive: true });
  return root;
}

/**
 * The log and trace tables, which the round trip scored without for four rounds.
 *
 * `logs.csv` and `traces.csv` were written by the exporter and never read as
 * input: every RE3 case round-tripped as a metric-only case while the two files
 * the slice exists for held a header and no rows, and the official metric -- which
 * reads the case directory name and the metric table -- scored them 1.00 anyway
 * (finding 315). The tests below are the four ways that can go wrong now that the
 * tables are read: the rows must be the corpus's, a table that cannot be read must
 * not shrink the claim, a declared table that is absent must fail, and a suite with
 * no plan must say nothing rather than nothing-but-green.
 */
describe('scripts/check-official.mjs · the log and trace tables as input', () => {
  const instant = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(11, 16);
  const at = (seconds: number): string => `${instant(seconds)}`;

  const LOG_HEADER = 'time,timestamp,container_name,message,pod_name,node_name';
  const TRACE_HEADER =
    'time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID';

  // The instants are deliberately not on a millisecond boundary: a fixture of round
  // numbers is what let the nanosecond conversion keep a defect for as long as it
  // had one (finding 316), and a round fixture would let the truncation path here
  // go untested end to end.
  function logsCsv(secondMessage: string): string {
    return [
      LOG_HEADER,
      `${at(1_700_000_000)},1700000000123456789,emailservice,started,emailservice-1,node-a`,
      `${at(1_700_000_060)},1700000060987654321,emailservice,${secondMessage},emailservice-1,node-a`,
    ].join('\n');
  }

  const TRACES = [
    TRACE_HEADER,
    `${at(1_700_000_000)},tr-1,sp-1,emailservice,Get,hipstershop.EmailService/Send,1700000000123,1700000000123456,4330,0.0,`,
    `${at(1_700_000_060)},tr-1,sp-2,emailservice,Get,hipstershop.EmailService/Send,1700000060987,1700000060987654,1200,,`,
  ].join('\n');

  function writeCaseWith(root: string, options: { logs?: string; traces?: string }): { caseId: string; cases: string } {
    const caseId = 'RE3-OB/emailservice_f1/1';
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(dir, 'data.csv'), 'time,emailservice_cpu\n1699999999,0.2\n1700000001,0.95\n');
    if (options.logs !== undefined) writeFileSync(join(dir, 'logs.csv'), options.logs);
    if (options.traces !== undefined) writeFileSync(join(dir, 'traces.csv'), options.traces);
    const cases = join(scratch, `modalities-${counter}-${options.logs === undefined ? 'nologs' : 'logs'}.json`);
    writeFileSync(
      cases,
      JSON.stringify({
        schema: 'rca-bench-rcaeval-cases/1',
        counts: { RE1: 0, RE2: 0, RE3: 1 },
        cases: [
          {
            caseId,
            component: 'emailservice',
            faultType: 'f1',
            injectTime: new Date(1_700_000_000_000).toISOString(),
            pathPrefix: `${caseId}/`,
            suite: 'RE3',
          },
        ],
      }),
    );
    return { caseId, cases };
  }

  it('carries every log row and every span into the export, and says so', () => {
    const root = freshRoot();
    const { cases } = writeCaseWith(root, { logs: logsCsv('still here'), traces: TRACES });
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP MODALITY .*logs: 2\/2 row\(s\)/);
    expect(result.stdout).toMatch(/ROUNDTRIP MODALITY .*traces: 2\/2 row\(s\)/);
    // The truncations are named per table rather than folded into "rows match",
    // because a reader has to be able to see that the export is not the corpus's
    // bytes: the instants are at the millisecond, `methodName` has no field, and
    // `statusCode` is a gRPC column this exporter leaves empty.
    expect(result.stdout).toContain('timestamp to the millisecond');
    expect(result.stdout).toContain('startTime to the millisecond');
    expect(result.stdout).toContain('not carried methodName');
    expect(result.stdout).toContain('statusCode');
    // And the whole run in one line, which is the number to compare between runs.
    expect(result.stdout).toMatch(/ROUNDTRIP modalities 2 table\(s\).*2 of 2 log row\(s\)/);
    // Both instants had finer digits and neither value could be carried.
    expect(result.stdout).toMatch(/4 cell\(s\) truncated to the millisecond/);
    expect(result.stdout).toMatch(/3 value\(s\) in columns the IR does not carry/);
  });

  it('fails when a row the corpus has does not reach the export', () => {
    // An empty `message` is a record this reader refuses, and refusing it makes the
    // exported table shorter than the corpus's. Before the tables were read there
    // was nothing to be short of.
    const root = freshRoot();
    const { cases } = writeCaseWith(root, { logs: logsCsv(''), traces: TRACES });
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/ROUNDTRIP MODALITY .*logs: 1\/2 row\(s\)/);
    expect(result.stderr).toContain('the exported logs table is not the corpus\'s');
    expect(result.stderr).toMatch(/1 row\(s\) against the corpus's 2/);
  });

  it('fails when a declared table is absent, rather than scoring the case without it', () => {
    const root = freshRoot();
    const { cases } = writeCaseWith(root, { traces: TRACES });
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RE3 declares a logs table and logs\.csv is not readable/);
  });

  it('says nothing at all about modalities for a suite whose tables it does not read', () => {
    // RE2's log table is nine columns, four of which the IR has no field for and one
    // of which feeds a closed vocabulary; no RE2 archive has been measured here. The
    // omission is stated in the script and recorded as open, and what this test
    // holds is that silence is silence -- a zero would read as "read them, found
    // nothing", which is the defect this whole section is about.
    const root = freshRoot();
    const caseId = 'RE2-ob-cpu_1';
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    // RE2's metric table in the corpus's own shape, so the case round-trips; the
    // point of the test is what the run says *about modalities*, and a case that
    // failed for another reason would say nothing about it.
    writeFileSync(join(dir, 'data.csv'), 'time,ob_cpu\n1699999999,0.2\n1700000001,0.95\n');
    const cases = join(scratch, 're2-no-modalities.json');
    writeFileSync(
      cases,
      JSON.stringify({
        schema: 'rca-bench-rcaeval-cases/1',
        counts: { RE1: 0, RE2: 1, RE3: 0 },
        cases: [
          {
            caseId,
            component: 'ob',
            faultType: 'cpu',
            injectTime: new Date(1_700_000_000_000).toISOString(),
            pathPrefix: `${caseId}/`,
            suite: 'RE2',
          },
        ],
      }),
    );
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain('ROUNDTRIP MODALITY');
    expect(result.stdout).not.toContain('ROUNDTRIP modalities');
  });
});
