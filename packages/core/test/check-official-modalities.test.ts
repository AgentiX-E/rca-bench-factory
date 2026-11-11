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
  function logsCsv(secondMessage: string, secondTimestamp = '1700000060987654321'): string {
    return [
      LOG_HEADER,
      `${at(1_700_000_000)},1700000000123456789,emailservice,started,emailservice-1,node-a`,
      `${at(1_700_000_060)},${secondTimestamp},emailservice,${secondMessage},emailservice-1,node-a`,
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
    // The cause is an instant the reader cannot parse. It used to be an empty
    // `message`, and v3.85 changed that on the evidence: 1,572 rows of
    // `RE2-SS/carts_cpu/1` have an empty message, and the three other log readers in
    // this package already emit `body: ''` for one. What this test is for is
    // unchanged -- a row that does not reach the export has to fail the case, and the
    // sentence has to give the two counts -- so the cause is a refusal that is still
    // a refusal.
    const root = freshRoot();
    const { cases } = writeCaseWith(root, { logs: logsCsv('still here', 'not-an-instant'), traces: TRACES });
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/ROUNDTRIP MODALITY .*logs: 1\/2 row\(s\)/);
    expect(result.stderr).toContain('the exported logs table is not the corpus\'s');
    expect(result.stderr).toMatch(/1 row\(s\) against the corpus's 2/);
  });

  it('refuses a table its plan names and the whole slice does not ship, once for the slice', () => {
    // This test used to hold that a table absent from a case failed *that case*, and
    // the assertion was the sentence `RE3 declares a logs table and logs.csv is not
    // readable under …`. On a corpus where one table is missing from one case that
    // reads correctly. On the real one it produced 90 identical lines: RE2 is one
    // suite over three systems, SockShop ships logs and no spans, and the plan was
    // written for the suite (finding 500).
    //
    // The claim is now split in two. A table missing from **some** cases of a slice is
    // an anomaly and fails the run; a table missing from **all** of them is a fact
    // about the slice, and the plan is what is wrong -- so the refusal names the
    // slice, once, with the count that distinguishes the two.
    const root = freshRoot();
    const { cases } = writeCaseWith(root, { traces: TRACES });
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RE3-OB: none of its 1 case\(s\) carries logs\.csv, which the RE3 plan names/);
    // And the case itself still round-trips its *traces*: the refusal is about the
    // plan, not about the case having done something wrong with the table it has.
    expect(result.stdout).toMatch(/ROUNDTRIP MODALITY .*traces: 2\/2 row\(s\)/);
    expect(result.stdout).toContain('ROUNDTRIP CENSUS modalities RE3-OB: logs 0/1, traces 1/1');
  });

  it('reads a slice whose plan is its own, and reports what the slice ships', () => {
    // SockShop, in miniature: two cases with logs and no spans. Before the slice-level
    // plan, both failed with the sentence above, one line each, on a corpus that had
    // not changed. The plan now says logs, the cases round-trip their logs, and the
    // census says the thing a reader needs: this slice carries no spans.
    //
    // The header here is the archive's own, read out of `RE2-SS.zip` on 2026-11-12:
    // seven columns, no `cluster_id` and no `log_template`, while the export writes
    // nine because `RCAEVAL_LOGS_COLUMNS.RE2` is the format's header and not the
    // corpus's. This fixture used to write nine -- a shape no SockShop case has --
    // which is why a plan claiming nine passed here and failed on all 270 cases of
    // the round trip.
    const root = freshRoot();
    const caseId = 'RE2-SS/carts_cpu/1';
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(dir, 'simple_metrics.csv'), 'time,carts_cpu\n1699999999,0.2\n1700000001,0.95\n');
    writeFileSync(
      join(dir, 'logs.csv'),
      `time,timestamp,container_name,message,level,req_path,error\n` +
        `${at(1_700_000_000)},1700000000123456789,carts,request handled,,,\n`,
    );
    const cases = join(scratch, 'ss-slice.json');
    writeFileSync(
      cases,
      JSON.stringify({
        schema: 'rca-bench-rcaeval-cases/1',
        counts: { RE1: 0, RE2: 1, RE3: 0 },
        cases: [
          {
            caseId,
            component: 'carts',
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
    // The log table is compared -- the evidence the slice does have -- and the run
    // says it compared one modality rather than two.
    expect(result.stdout).toMatch(/ROUNDTRIP MODALITY .*logs: 1\/1 row\(s\)/);
    expect(result.stdout).toMatch(/ROUNDTRIP modalities 1 table\(s\) over 1 modality\(ies\)/);
    expect(result.stdout).toContain('ROUNDTRIP CENSUS modalities RE2-SS: logs 1/1, traces 0/1');
    // And the two columns the plan names and this corpus does not have are reported
    // once, as a count, rather than as a case that is wrong.
    expect(result.stdout).toContain(
      'ROUNDTRIP CENSUS columns RE2-SS: logs lacks cluster_id on 1/1 case(s), log_template on 1/1 case(s)',
    );
    expect(result.stdout).toContain('cluster_id (absent from the corpus, 0 written)');
    // And no trace table was silently claimed: the summary's span count is zero of
    // zero, which reads as "nothing to compare", not as "compared and matched".
    expect(result.stdout).toMatch(/0 of 0 span\(s\)/);
  });

  it('refuses a slice that carries one of its two tables on some cases only', () => {
    // The other half, and the reason the census is a measurement rather than a
    // permission: a slice that carries traces on one case and not the next is a
    // partial extraction, not a slice without spans. That must fail, and the sentence
    // has to name the count and the first case, because "some cases are wrong" is an
    // operator's problem while "this slice has no spans" is a plan's.
    const root = freshRoot();
    const first = writeCaseWith(root, { logs: logsCsv('still here'), traces: TRACES });
    const secondDir = join(root, 'RE3-OB/emailservice_f1/2');
    mkdirSync(secondDir, { recursive: true });
    writeFileSync(join(secondDir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(secondDir, 'data.csv'), 'time,emailservice_cpu\n1699999999,0.2\n1700000001,0.95\n');
    writeFileSync(join(secondDir, 'logs.csv'), logsCsv('still here'));
    const cases = join(scratch, 'partial-slice.json');
    writeFileSync(
      cases,
      JSON.stringify({
        schema: 'rca-bench-rcaeval-cases/1',
        counts: { RE1: 0, RE2: 0, RE3: 2 },
        cases: [first.caseId, 'RE3-OB/emailservice_f1/2'].map((caseId) => ({
          caseId,
          component: 'emailservice',
          faultType: 'f1',
          injectTime: new Date(1_700_000_000_000).toISOString(),
          pathPrefix: `${caseId}/`,
          suite: 'RE3',
        })),
      }),
    );
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /RE3-OB: 1 of 2 case\(s\) carry no traces\.csv, so the traces table its plan names was compared on only 1 of them \(first: RE3-OB\/emailservice_f1\/2\)/,
    );
    expect(result.stdout).toContain('ROUNDTRIP CENSUS modalities RE3-OB: logs 2/2, traces 1/2');
  });

  it('says nothing at all about modalities for a suite whose tables it does not read', () => {
    // This test used to be about RE2, whose log table was nine columns with four the
    // IR had no field for and a `level` that fed a closed vocabulary, and which no
    // archive in this tree had been measured on. It has been measured since -- 91
    // `logs.csv` files, 15 224 545 rows -- and both of RE2's tables now round-trip,
    // so RE2 is no longer the suite that stays silent.
    //
    // RE1 is: it ships `metrics.json` and `data.csv` and nothing else, and it is not
    // in `MODALITY_PLANS`. What this test holds is unchanged and is the reason to
    // keep it -- silence is silence, and a zero would read as "read them, found
    // nothing", which is the defect this whole section is about.
    const root = freshRoot();
    const caseId = 'RE1-ob-cpu_1';
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
        counts: { RE1: 1, RE2: 0, RE3: 0 },
        cases: [
          {
            caseId,
            component: 'ob',
            faultType: 'cpu',
            injectTime: new Date(1_700_000_000_000).toISOString(),
            pathPrefix: `${caseId}/`,
            suite: 'RE1',
          },
        ],
      }),
    );
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain('ROUNDTRIP MODALITY');
    expect(result.stdout).not.toContain('ROUNDTRIP modalities');
    // Not even the census line, which v3.76 added: it is built from the files the walk
    // saw, and a slice whose tables this script never reads would get `logs 0/1` -- a
    // number about carriage that reads as a comparison nobody made.
    expect(result.stdout).not.toContain('ROUNDTRIP CENSUS modalities');
  });
});
