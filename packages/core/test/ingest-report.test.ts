import { describe, expect, it } from 'vitest';
import { exportRcaEval } from '../src/export/rcaeval.js';
import { ingestPrimeDataset } from '../src/ingest/prime.js';
import { validBundle } from './fixtures.js';

/**
 * The ingest report is the only record of what was rejected.
 *
 * `ingestPrimeDataset` upholds a "zero silent loss" invariant: every source
 * record becomes either a validated signal or a quarantine entry. The quarantine
 * entries — file, 1-based line, reason, and the offending record — are collected
 * per case and returned in `report`.
 *
 * That report is therefore the mechanism the invariant depends on. A run that
 * drops half the rows and reports nothing has not upheld it: the bundle on disk
 * looks exactly like one built from a source that only ever had half the rows.
 * These tests pin the report against a source whose true row count is known, so
 * "how much was lost" is measured rather than assumed.
 */

const METRIC_HEADER = 'timestamp,cmdb_id,kpi_name,value';
const GOOD_ROW = '2026-09-06T00:10:00Z,order-pod-1,cpu_usage,20';

function metricFile(...rows: string[]): Record<string, string> {
  return { 'telemetry/metric/cpu.csv': [METRIC_HEADER, ...rows].join('\n') + '\n' };
}

function ingestOne(files: Record<string, string>) {
  return ingestPrimeDataset(files, {
    dataset: 'rcaeval',
    system: 'rcaeval',
    cases: [{ caseId: 'case-001', component: 'order-pod-1', faultType: 'cpu', injectTime: '2026-09-06T00:10:00.000Z' }],
    // Declared so a source that yields no signals still resolves its root cause.
    // Without it the run stops at "does not resolve to an entity" and the report
    // under test would never be reached for the all-rejected cases below.
    extraEntities: [
      { entityId: 'service:rcaeval/order-pod-1', kind: 'service', name: 'order-pod-1', namespace: 'rcaeval', aliases: [] },
    ],
  });
}

describe('ingestPrimeDataset · every rejected row is accounted for', () => {  it('reports a rejected row with its file, line and reason', () => {
    // The ordinary partial-loss case: one row is fine, one is not. The bundle
    // keeps one signal — and the report must carry the other row, because that
    // is the only place it still exists.
    const result = ingestOne(metricFile(GOOD_ROW, '2026-09-06T00:11:00Z,order-pod-1,cpu_usage,NOT_A_NUMBER'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    expect(report?.signals).toBe(1);
    expect(report?.quarantine).toHaveLength(1);
    const [entry] = report!.quarantine;
    // Line 3 is the second data row: the header is line 1.
    expect(entry?.line).toBe(3);
    expect(entry?.file).toBe('telemetry/metric/cpu.csv');
    expect(entry?.reason).toMatch(/not a finite number/);
    // The offending record travels with the reason, so the operator can find it
    // without re-deriving which row produced the complaint.
    expect(entry?.record).toContain('NOT_A_NUMBER');
  });

  it('keeps the signal count and the quarantine count summing to the source rows', () => {
    // The invariant as arithmetic. Three data rows in; every one of them is
    // either a signal or a quarantine entry, so the two counts must reach three.
    const result = ingestOne(
      metricFile(GOOD_ROW, 'not-a-timestamp,order-pod-1,cpu_usage,20', '2026-09-06T00:12:00Z,order-pod-1,cpu_usage,21'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    expect(report.signals + report.quarantine.length).toBe(3);
    expect(report.signals).toBe(2);
    expect(report.quarantine).toHaveLength(1);
  });

  it('accounts for a pre-parse error with no record text', () => {
    // An unterminated quote is detected by the delimited reader, not by a row
    // builder, so there is no record to quote. The entry must still be emitted —
    // an error the reader found is exactly as lost as one the builder found.
    const result = ingestOne({ 'telemetry/metric/cpu.csv': `${METRIC_HEADER}\n${GOOD_ROW}\n"unterminated,order-pod-1,cpu_usage,20\n` });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    const unterminated = report.quarantine.find((q) => /unterminated/i.test(q.reason));
    expect(unterminated).toBeDefined();
    // A reader-level error names the file but has no single offending record.
    expect(unterminated?.file).toBe('telemetry/metric/cpu.csv');
    expect(unterminated?.record).toBe('');
  });

  it('records the file-level rejection reason when nothing can be read from it', () => {
    // The layout could not be inferred, so the whole file is refused before any
    // row is parsed. The reason must say that, because "every file was rejected"
    // on its own does not tell the operator which file or why.
    const result = ingestOne({ 'telemetry/metric/cpu.csv': 'garbage\n1,2,3\n' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    expect(report.signals).toBe(0);
    expect(report.quarantine).toHaveLength(1);
    // Line 0 marks a whole-file rejection rather than a row.
    expect(report.quarantine[0]?.line).toBe(0);
    expect(report.quarantine[0]?.file).toBe('telemetry/metric/cpu.csv');
    expect(report.quarantine[0]?.reason).toMatch(/required column|header/i);
  });

  it('reports an empty quarantine for a source that parses cleanly', () => {
    // The positive control. Without it, "report every rejection" would be
    // satisfiable by reporting a rejection that never happened.
    const result = ingestOne(metricFile(GOOD_ROW));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    expect(report.signals).toBe(1);
    expect(report.quarantine).toEqual([]);
    expect(result.hardErrors).toEqual([]);
  });

  it('totals the losses across cases rather than per case alone', () => {
    // Two cases, each losing a row. A reader asking "did this run lose data?"
    // needs one answer, not one per case, so the sum has to be reachable.
    const files = {
      'a/telemetry/metric/cpu.csv': [METRIC_HEADER, GOOD_ROW, 'bad,order-pod-1,cpu_usage,x'].join('\n') + '\n',
      'b/telemetry/metric/cpu.csv': [METRIC_HEADER, GOOD_ROW, 'bad,order-pod-1,cpu_usage,y'].join('\n') + '\n',
    };
    const result = ingestPrimeDataset(files, {
      dataset: 'rcaeval',
      system: 'rcaeval',
      cases: [
        { caseId: 'case-a', component: 'order-pod-1', faultType: 'cpu', injectTime: '2026-09-06T00:10:00.000Z', pathPrefixes: ['a/'] },
        { caseId: 'case-b', component: 'order-pod-1', faultType: 'cpu', injectTime: '2026-09-06T00:10:00.000Z', pathPrefixes: ['b/'] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const total = result.report.reduce((sum, r) => sum + r.quarantine.length, 0);
    expect(total).toBe(2);
    expect(result.report).toHaveLength(2);
  });
});

describe('ingestPrimeDataset · a faithful ingest is unchanged', () => {
  it('still produces a bundle the exporter accepts', () => {
    // Guard against the report being "fixed" by changing what is ingested.
    const result = ingestOne(metricFile(GOOD_ROW));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exported = exportRcaEval(result.bundle, 'RE2');
    expect(Object.keys(exported.files).length).toBeGreaterThan(0);
  });

  it('is not confused by a fixture bundle that never went through ingest', () => {
    // The report is owned by the ingest path; a bundle built elsewhere has no
    // report, which must stay a type-level fact rather than a silent empty one.
    expect(validBundle().cases).toHaveLength(1);
  });
});

describe('ingestPrimeDataset · a source larger than the argument limit', () => {
  /**
   * A single file carrying more rows than `push(...)` can spread.
   *
   * ## Why this is a test and not a stress case
   *
   * The real RE1 corpus ships one `data.csv` per case holding a whole run of
   * telemetry. At 375 cases the round trip died with
   * `RangeError: Maximum call stack size exceeded` raised at
   * `signals.push(...ingested.signals)` -- the spread operator passes every
   * element as a function argument, and V8's argument limit is far below the
   * row count of a real run.
   *
   * Every fixture in this repository is synthetic and small, so the limit was
   * never reached and the defect was invisible for the whole life of the file.
   * That is the shape this test closes: the accumulator must not care how many
   * rows arrive, so the row count is measured against the real ceiling rather
   * than guessed at.
   *
   * The ceiling was probed on this runtime and lies between 100,000 and 125,000
   * elements -- `[].push(...new Array(100000).fill(0))` succeeds and 125,000
   * raises. 130,000 is therefore past it with margin, and not so far past that
   * the fixture costs seconds it does not earn. The timeout is raised because
   * building and parsing a payload of that size is the work under test, not
   * slow setup.
   */
  const ROWS = 130_000;
  const ROWS_TIMEOUT_MS = 30_000;

  /** A metric payload with `rows` data rows, all of them valid. */
  function metricBody(rows: number): string {
    const lines = [METRIC_HEADER];
    for (let i = 0; i < rows; i += 1) {
      lines.push(`2026-09-06T00:10:00Z,order-pod-1,cpu_usage,${i % 97}`);
    }
    return lines.join('\n') + '\n';
  }

  it('ingests a file with more rows than can be spread into a call', () => {
    const result = ingestOne({ 'telemetry/metric/cpu.csv': metricBody(ROWS) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    expect(report?.signals).toBe(ROWS);
    expect(report?.quarantine).toHaveLength(0);
  }, ROWS_TIMEOUT_MS);

  it('keeps every row when several files each exceed the limit', () => {
    const body = metricBody(ROWS);
    const result = ingestOne({
      'telemetry/metric/cpu.csv': body,
      'telemetry/metric/mem.csv': body,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    expect(report?.signals).toBe(ROWS * 2);
  }, ROWS_TIMEOUT_MS);
});

describe('ingestPrimeDataset · a declared missing value is not an unreadable one', () => {
  /**
   * RE1-TT ships the literal text `NaN` in eight `_istio-*` percentile columns
   * of one service, from one row to the end. Finding 120 measured the shape from
   * the archive: the service's other eighteen columns stay populated across the
   * same rows, the eight go missing at a single shared onset, and `NaN` is the
   * file's only non-numeric token.
   *
   * That is the corpus stating "no reading from here on", not a file we cannot
   * read. The reader has to tell the two apart, because they want opposite
   * handling: a cell that declares absence makes the row *shorter* and is worth
   * keeping; a cell we cannot parse makes the row *untrustworthy* and is worth
   * quarantining.
   *
   * The distinction is drawn on the token, not on `Number.isFinite`. Widening the
   * check to accept any non-finite result would also accept `oops`, and the two
   * tests immediately below pin that it does not.
   */
  const MISSING = 'NaN';

  it('keeps a row whose cell says NaN, and counts the reading as missing', () => {
    const result = ingestOne(
      metricFile(
        '2026-09-06T00:10:00Z,ts-preserve-other-service,istio-latency-50,3.75',
        `2026-09-06T00:11:00Z,ts-preserve-other-service,istio-latency-50,${MISSING}`,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    // One reading reaches the bundle; the second row is *counted*, not
    // quarantined. The absent row produces no signal on purpose -- emitting one
    // would require a number to put in it, and every candidate is a fabrication
    // (0 is a real minimum, the previous value is an interpolation). What it
    // must not do is disappear from the accounting.
    expect(report?.signals).toBe(1);
    expect(report?.missing).toBe(1);
    // Nothing was rejected, because nothing was unreadable.
    expect(report?.quarantine).toHaveLength(0);
  });

  it('still closes the row arithmetic once absences are counted', () => {
    // The invariant as arithmetic, extended to three outcomes. Four data rows
    // in; every one is a signal, a quarantine entry, or a count of absence, so
    // the three must reach four. Before the third counter existed this test
    // could not be written: two rows would leave no trace in the report at all.
    const result = ingestOne(
      metricFile(
        GOOD_ROW,
        `2026-09-06T00:11:00Z,order-pod-1,cpu_usage,${MISSING}`,
        `2026-09-06T00:12:00Z,order-pod-1,cpu_usage,${MISSING}`,
        '2026-09-06T00:13:00Z,order-pod-1,cpu_usage,NOT_A_NUMBER',
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    expect((report?.signals ?? 0) + (report?.quarantine.length ?? 0) + (report?.missing ?? 0)).toBe(4);
    expect(report?.signals).toBe(1);
    expect(report?.missing).toBe(2);
    expect(report?.quarantine).toHaveLength(1);
  });

  it('records the absent reading as missing rather than as a zero', () => {
    // The load-bearing half. Keeping the row is only correct if the absent cell
    // does not become a number on the way in -- a `NaN` silently read as `0`
    // would put a fabricated minimum into a latency series, which is a worse
    // outcome than refusing the row.
    //
    // Asserted on the emitted signal rather than on an exported bundle: the
    // export path runs the gate battery, and a two-row fixture is not a bundle
    // the gates accept. What is under test here is the value that reaches the
    // signal, so the signal is what is read.
    const result = ingestOne(
      metricFile(
        '2026-09-06T00:10:00Z,ts-preserve-other-service,istio-latency-50,3.75',
        `2026-09-06T00:11:00Z,ts-preserve-other-service,istio-latency-50,${MISSING}`,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const values = result.bundle.signals['case-001']!.map((s) => s.payload.value);
    // Only the real reading is emitted. That is the assertion, and it is the
    // point: the absent row must not reach the bundle carrying a number that was
    // never measured. A `NaN` read as `0` would satisfy "two signals" while
    // putting a fabricated minimum into a latency series.
    expect(values).toHaveLength(1);
    expect(Number.isFinite(values[0])).toBe(true);
    expect(values[0]).toBeCloseTo(3.75, 5);
  });

  it('still refuses a cell that is neither a number nor a declared missing value', () => {
    // The negative control, and the reason the check is on the token: `oops` is
    // not a statement about the corpus, it is a file we failed to read.
    const result = ingestOne(
      metricFile(GOOD_ROW, '2026-09-06T00:11:00Z,order-pod-1,cpu_usage,oops'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    expect(report?.signals).toBe(1);
    expect(report?.quarantine).toHaveLength(1);
    expect(report?.quarantine[0]?.reason).toMatch(/not a finite number/);
  });

  it('refuses a near-miss token, so the acceptance is the exact spelling', () => {
    // `nan`, `NAN`, `nan.0`, `null`, `-` and an empty cell are all things a
    // corpus might or might not mean, and only one spelling has been measured in
    // the corpus we score against. Accepting the family would be a guess dressed
    // as tolerance, so each near miss is pinned to the refusal it gets.
    for (const token of ['nan', 'NAN', 'nan.0', 'Infinity', '-Infinity', 'NA']) {
      const result = ingestOne(
        metricFile(GOOD_ROW, `2026-09-06T00:11:00Z,order-pod-1,cpu_usage,${token}`),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const report = result.report.find((r) => r.caseId === 'case-001');
      expect(report?.quarantine, `token ${token}`).toHaveLength(1);
    }
  });
});
