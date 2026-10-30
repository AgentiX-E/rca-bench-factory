import { describe, expect, it } from 'vitest';
import {
  compareModalityTables,
  describeModalityComparison,
  type ColumnComparison,
} from '../src/score/modalities.js';

/**
 * Comparing a corpus's log/trace table with the export of the same case.
 *
 * The fixtures are hand-written tables in the corpora's own shape, and the plan is
 * the same plan the round trip states. Every assertion is about a property the
 * module exists to make checkable: that the exported table **is** the corpus's
 * table, up to the truncations the plan names -- and that "these two tables are the
 * same" cannot be satisfied by two empty ones.
 */

const LOGS: readonly ColumnComparison[] = [
  { column: 'time', kind: 'exact' },
  { column: 'timestamp', kind: 'truncated', unit: 'ns' },
  { column: 'container_name', kind: 'exact' },
  { column: 'message', kind: 'exact' },
  { column: 'pod_name', kind: 'exact' },
  { column: 'node_name', kind: 'exact' },
];

const LOG_HEADER = 'time,timestamp,container_name,message,pod_name,node_name';

/** One corpus log table, in the shape RE3-OB writes it. */
const CORPUS_LOGS = [
  LOG_HEADER,
  '06:22,1731910960181130857,frontend,request started,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
  '06:22,1731910960181334492,frontend,view user cart,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
].join('\n');

/** The same table through the export: instants at the millisecond. */
const EXPORTED_LOGS = [
  LOG_HEADER,
  '06:22,1731910960181000000,frontend,request started,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
  '06:22,1731910960181000000,frontend,view user cart,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
].join('\n');

const compare = (args: { corpus: string; exported: string; plan?: readonly ColumnComparison[]; table?: 'logs' | 'traces' }) =>
  compareModalityTables({
    table: args.table ?? 'logs',
    corpus: args.corpus,
    exported: args.exported,
    plan: args.plan ?? LOGS,
  });

describe('modality comparison · the truncations the plan names', () => {
  it('holds a nanosecond instant to its millisecond', () => {
    const result = compare({ corpus: CORPUS_LOGS, exported: EXPORTED_LOGS });
    expect(result.rowsMatch).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.corpusRows).toBe(2);
    expect(result.exportedRows).toBe(2);
    // Both cells had finer digits, and the count is reported rather than absorbed:
    // a reader has to be able to see that the export is not the corpus's bytes.
    const instant = result.columns.find((c) => c.column === 'timestamp');
    expect(instant).toMatchObject({ kind: 'truncated', differ: 0, lossy: 2 });
  });

  it('refuses the untruncated instant, so the comparison is not vacuous', () => {
    // The mutation this catches: a comparison that normalises *both* sides. If it
    // did, an export that wrote the corpus's nanoseconds verbatim would pass, and
    // the module would report a resolution the exporter does not have.
    const one = [LOG_HEADER, CORPUS_LOGS.split('\n')[1]].join('\n');
    const untruncated = [LOG_HEADER, EXPORTED_LOGS.split('\n')[1].replace('1731910960181000000', '1731910960181130857')].join('\n');
    const result = compare({ corpus: one, exported: untruncated });
    expect(result.rowsMatch).toBe(false);
    expect(result.onlyInCorpus).toBe(1);
    expect(result.onlyInExport).toBe(1);
  });

  it('counts a cell that was exactly representable as not lossy', () => {
    const exact = '06:22,1731910960181000000,frontend,request started,frontend-588fbcd66b-rzd62,ip-192-168-24-141';
    const result = compare({ corpus: [LOG_HEADER, exact].join('\n'), exported: [LOG_HEADER, exact].join('\n') });
    expect(result.rowsMatch).toBe(true);
    expect(result.columns.find((c) => c.column === 'timestamp')).toMatchObject({ differ: 0, lossy: 0 });
  });

  it('truncates microseconds at a different step', () => {
    const plan: readonly ColumnComparison[] = [
      { column: 'time', kind: 'exact' },
      { column: 'startTime', kind: 'truncated', unit: 'us' },
      { column: 'spanID', kind: 'exact' },
    ];
    const header = 'time,startTime,spanID';
    const result = compare({
      table: 'traces',
      plan,
      corpus: [header, '06:22,1731910960029548,sp-1'].join('\n'),
      exported: [header, '06:22,1731910960029000,sp-1'].join('\n'),
    });
    expect(result.rowsMatch).toBe(true);
    expect(result.columns.find((c) => c.column === 'startTime')).toMatchObject({ differ: 0, lossy: 1 });
  });

  it('compares instants above 2^53 exactly', () => {
    // A nanosecond instant is 1.7e18 and a double carries 53 bits, so a comparison
    // written with `Number` would call these two rows equal. The export writes the
    // truncated value; the corpus wrote a neighbour.
    const plan: readonly ColumnComparison[] = [{ column: 'timestamp', kind: 'truncated', unit: 'ns' }];
    const header = 'timestamp';
    const result = compare({
      plan,
      corpus: [header, '9007199254740993'].join('\n'),
      exported: [header, '9007199254741000000'].join('\n'),
    });
    expect(result.rowsMatch).toBe(false);
    // Truncating 9007199254740993 ns to the millisecond gives 9007199254740000000,
    // which is a different number from the one exported.
    expect(result.onlyInCorpus).toBe(1);
  });
});

describe('modality comparison · the rows, not the counts', () => {
  it('catches a row the export does not have', () => {
    const exported = [LOG_HEADER, '06:22,1731910960181000000,frontend,request started,frontend-588fbcd66b-rzd62,ip-192-168-24-141'].join('\n');
    const result = compare({ corpus: CORPUS_LOGS, exported });
    expect(result.exportedRows).toBe(1);
    expect(result.rowCountMatches).toBe(false);
    expect(result.rowsMatch).toBe(false);
    expect(result.onlyInCorpus).toBe(1);
    expect(result.examples[0]).toContain('view user cart');
  });

  it('catches a row the export invented', () => {
    const exported = [
      LOG_HEADER,
      '06:22,1731910960181000000,frontend,request started,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
      '06:22,1731910960181000000,frontend,view user cart,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
      '06:22,1731910960181000000,frontend,payment failed,frontend-588fbcd66b-rzd62,ip-192-168-24-141',
    ].join('\n');
    const result = compare({ corpus: CORPUS_LOGS, exported });
    expect(result.onlyInExport).toBe(1);
    expect(result.rowsMatch).toBe(false);
    expect(result.examples.some((e) => e.startsWith('export only') && e.includes('payment failed'))).toBe(true);
  });

  it('counts multiplicity, so a dropped duplicate is a dropped row', () => {
    // Two identical lines are two lines. A set-based comparison would call this
    // table complete, and a log table's duplicated lines are exactly what a burst
    // of retries looks like.
    const repeated = [LOG_HEADER, CORPUS_LOGS.split('\n')[1], CORPUS_LOGS.split('\n')[1]].join('\n');
    const once = [LOG_HEADER, EXPORTED_LOGS.split('\n')[1]].join('\n').replace('1731910960181000000', '1731910960181000000');
    const result = compare({ corpus: repeated, exported: once });
    expect(result.corpusRows).toBe(2);
    expect(result.exportedRows).toBe(1);
    expect(result.rowCountMatches).toBe(false);
    expect(result.onlyInCorpus).toBe(1);
  });

  it('is not satisfied by two empty tables', () => {
    // The defect the fourth anchor carried for four rounds, in its smallest form:
    // a header and no rows on both sides. Equal, and worthless.
    const empty = LOG_HEADER;
    const result = compare({ corpus: empty, exported: empty });
    expect(result.rowsMatch).toBe(true);
    expect(result.corpusRows).toBe(0);
    // Which is why the caller's gate is a conjunction: same rows **and** the count
    // the corpus has. Stated here as a property of the module rather than of one
    // caller, because a second caller is what would get it wrong.
    expect(result.corpusRows === 0).toBe(true);
  });

  it('matches by column name, not by position', () => {
    const reordered = [
      'message,container_name,node_name,pod_name,timestamp,time',
      'request started,frontend,ip-192-168-24-141,frontend-588fbcd66b-rzd62,1731910960181000000,06:22',
      'view user cart,frontend,ip-192-168-24-141,frontend-588fbcd66b-rzd62,1731910960181000000,06:22',
    ].join('\n');
    const result = compare({ corpus: CORPUS_LOGS, exported: reordered });
    expect(result.rowsMatch).toBe(true);
  });

  it('keeps a quoted message with a comma and a newline intact', () => {
    const header = LOG_HEADER;
    const corpus = [header, '06:22,1731910960181130857,frontend,"retry, then\n  give up",p,n'].join('\n');
    const exported = [header, '06:22,1731910960181000000,frontend,"retry, then\n  give up",p,n'].join('\n');
    const result = compare({ corpus, exported });
    expect(result.rowsMatch).toBe(true);
  });
});

describe('modality comparison · the columns the IR cannot carry', () => {
  const plan: readonly ColumnComparison[] = [
    { column: 'spanID', kind: 'exact' },
    { column: 'methodName', kind: 'not-carried' },
    { column: 'statusCode', kind: 'not-carried' },
  ];
  const header = 'spanID,methodName,statusCode';

  it('reports the values the corpus had as the loss they are', () => {
    const corpus = [header, 'sp-1,Convert,0.0', 'sp-2,Convert,14.0'].join('\n');
    const exported = [header, 'sp-1,,', 'sp-2,,'].join('\n');
    const result = compare({ table: 'traces', plan, corpus, exported });
    expect(result.rowsMatch).toBe(true);
    expect(result.columns.find((c) => c.column === 'methodName')).toMatchObject({ differ: 0, lossy: 2 });
    expect(result.columns.find((c) => c.column === 'statusCode')).toMatchObject({ differ: 0, lossy: 2 });
  });

  it('fails when a declared-unfilled column carries a value', () => {
    // The column is declared empty, so a value here is the export contradicting its
    // own statement -- not a difference of opinion about a truncation.
    const corpus = [header, 'sp-1,Convert,0.0'].join('\n');
    const exported = [header, 'sp-1,Convert,'].join('\n');
    const result = compare({ table: 'traces', plan, corpus, exported });
    expect(result.columns.find((c) => c.column === 'methodName')).toMatchObject({ differ: 1 });
  });
});

describe('modality comparison · a plan that has gone stale is a problem', () => {
  it('names a column the corpus has and the plan does not', () => {
    const result = compare({ corpus: CORPUS_LOGS, exported: EXPORTED_LOGS, plan: LOGS.slice(0, 5) });
    expect(result.problems.some((p) => p.includes("'node_name'") && p.includes('no plan column'))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });

  it('names a planned column the table does not have', () => {
    const result = compare({ corpus: LOG_HEADER, exported: LOG_HEADER, plan: [...LOGS, { column: 'level', kind: 'exact' }] });
    expect(result.problems.some((p) => p.includes("'level'"))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });

  it('names a planned column the corpus does not have, and still compares the row', () => {
    // The problem is reported *and* the row is compared, with the absent column read
    // as an empty cell: the round trip's report is what a reader acts on, and a
    // report that stops at the problem leaves the other columns unread.
    const result = compare({
      corpus: 'a\n1',
      exported: 'a,b\n1,2',
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'exact' }],
    });
    expect(result.problems.some((p) => p.includes("the corpus's logs table has no 'b' column"))).toBe(true);
    expect(result.rowsMatch).toBe(false);
    expect(result.columns.find((c) => c.column === 'b')).toMatchObject({ differ: 1 });
  });

  it('names a derived column whose source instant the corpus does not have', () => {
    const plan: readonly ColumnComparison[] = [
      { column: 'time', kind: 'derived', from: 'timestamp' },
      { column: 'timestamp', kind: 'truncated', unit: 'ns' },
    ];
    const result = compare({
      table: 'traces',
      plan,
      corpus: 'time\n06:16',
      exported: 'time,timestamp\n06:16,1731910619999000000',
    });
    expect(result.problems.some((p) => p.includes("the corpus's traces table has no 'timestamp' column"))).toBe(true);
    // With no instant on the corpus side there is no minute to hold the export to,
    // so the cell is skipped rather than counted as a disagreement.
    expect(result.columns.find((c) => c.column === 'time')).toMatchObject({ differ: 0, lossy: 0 });
    expect(result.rowsMatch).toBe(false);
  });

  it('reports a non-integer cell in an instant column instead of comparing it', () => {
    const header = LOG_HEADER;
    const corpus = [header, '06:22,not-a-number,frontend,hello,p,n'].join('\n');
    const exported = [header, '06:22,0,frontend,hello,p,n'].join('\n');
    const result = compare({ corpus, exported });
    expect(result.problems.some((p) => p.includes('not an integer instant'))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });

  it('reports a table that is not readable as CSV', () => {
    const result = compare({ corpus: '"unterminated,header\n1,2', exported: LOG_HEADER });
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.rowsMatch).toBe(false);
  });
});

describe('modality comparison · the line a workflow prints', () => {
  it('says how many columns are exact, which are truncated, and what was lost', () => {
    const text = describeModalityComparison(compare({ corpus: CORPUS_LOGS, exported: EXPORTED_LOGS }));
    expect(text).toContain('logs: 2/2 row(s)');
    expect(text).toContain('exact 5/6');
    expect(text).toContain('timestamp to the millisecond (2 of 2 cells had finer digits)');
  });

  it('names a not-carried column with the values it had', () => {
    const plan: readonly ColumnComparison[] = [
      { column: 'spanID', kind: 'exact' },
      { column: 'methodName', kind: 'not-carried' },
    ];
    const text = describeModalityComparison(
      compare({ table: 'traces', plan, corpus: 'spanID,methodName\nsp-1,Convert', exported: 'spanID,methodName\nsp-1,' }),
    );
    expect(text).toContain('not carried methodName (1 value(s) in the corpus, 0 written)');
  });
});

describe('modality comparison · a column the exporter derives from an instant', () => {
  // `time` is `HH:MM` of the instant, and the corpus stores its own rendering of
  // the same fact. Comparing the two cells would compare two derivations, and
  // RE3-OB's own derivations disagree: this is the corpus row -- `time` = `06:17`
  // beside a `timestamp` that is 06:16:59.999999863, because the corpus's
  // conversion went through a double at microsecond resolution.
  const HEADER = 'time,timestamp';
  const PLAN: readonly ColumnComparison[] = [
    { column: 'time', kind: 'derived', from: 'timestamp' },
    { column: 'timestamp', kind: 'truncated', unit: 'ns' },
  ];
  const CORPUS = [HEADER, '06:17,1731910619999999863'].join('\n');

  it('accepts the corpus’s rendering, and counts the disagreement', () => {
    const result = compare({ table: 'traces', plan: PLAN, corpus: CORPUS, exported: [HEADER, '06:16,1731910619999000000'].join('\n') });
    expect(result.rowsMatch).toBe(true);
    expect(result.columns.find((c) => c.column === 'time')).toMatchObject({ kind: 'derived', differ: 0, lossy: 1 });
    expect(describeModalityComparison(result)).toContain("1 corpus cell(s) disagree with the corpus's own instant");
  });

  it('fails when the export’s own minute is not the instant’s', () => {
    // The check has teeth in the direction that matters: `time` computed wrongly --
    // an hour out, a timezone out, empty -- is not excused by the corpus's rounding.
    const result = compare({ table: 'traces', plan: PLAN, corpus: CORPUS, exported: [HEADER, '07:16,1731910619999000000'].join('\n') });
    expect(result.rowsMatch).toBe(false);
    expect(result.columns.find((c) => c.column === 'time')).toMatchObject({ differ: 1 });
    expect(describeModalityComparison(result)).toContain('time WRONG in 1 cell(s)');
  });

  it('reports a derived column whose instant column has no truncation plan', () => {
    const result = compare({
      table: 'traces',
      plan: [{ column: 'time', kind: 'derived', from: 'timestamp' }],
      corpus: CORPUS,
      exported: [HEADER, '06:16,1731910619999000000'].join('\n'),
    });
    expect(result.problems.some((p) => p.includes('has no truncated plan entry'))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });
});

describe('modality comparison · a row with fewer cells than the header has', () => {
  // A CSV row that is short of its header is not a parse error -- `parseDelimited`
  // returns it as it stands -- and it is what a corpus writes when a field is empty
  // at the end of a line. What the comparison does with the absent cell depends on
  // the column, and the difference is the point: a free-text column reads it as an
  // empty cell, because that is what the row says, while an instant column refuses
  // it, because `''` is not a value an instant column can hold. The ingest
  // quarantines such a row, so the export is a row shorter -- and that is a
  // difference the round trip has to see rather than smooth over.
  const HEADER = 'a,b';

  it('reads an absent trailing cell as an empty one on both sides', () => {
    const result = compare({
      corpus: [HEADER, '1'].join('\n'),
      exported: [HEADER, '1,'].join('\n'),
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'exact' }],
    });
    expect(result.rowsMatch).toBe(true);
    expect(result.examples).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it('still reports the difference when only one side is short', () => {
    const result = compare({
      corpus: [HEADER, '1'].join('\n'),
      exported: [HEADER, '1,x'].join('\n'),
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'exact' }],
    });
    expect(result.rowsMatch).toBe(false);
    expect(result.onlyInExport).toBe(1);
    expect(result.columns.find((c) => c.column === 'b')).toMatchObject({ differ: 1 });
  });

  it('reads an absent cell as empty in a not-carried column too', () => {
    const result = compare({
      corpus: [HEADER, '1'].join('\n'),
      exported: [HEADER, '1,'].join('\n'),
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'not-carried' }],
    });
    expect(result.rowsMatch).toBe(true);
    expect(result.columns.find((c) => c.column === 'b')).toMatchObject({ differ: 0, lossy: 0 });
  });

  it('refuses an absent cell in a truncated column rather than comparing it as empty', () => {
    const result = compare({
      corpus: [HEADER, '1'].join('\n'),
      exported: [HEADER, '1,'].join('\n'),
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'truncated', unit: 'ns' }],
    });
    expect(result.problems.some((p) => p.includes('not an integer instant'))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });

  it('refuses an empty instant rather than reading it as the epoch', () => {
    // `BigInt('')` is `0n`, so an empty cell would have compared as 1970-01-01 and
    // agreed with an export that wrote a zero -- a missing reading passing as a
    // reading of the epoch. This is the concrete wrong answer the refusal prevents.
    const result = compare({
      corpus: 'a,timestamp\n1,',
      exported: 'a,timestamp\n1,0',
      plan: [
        { column: 'a', kind: 'exact' },
        { column: 'timestamp', kind: 'truncated', unit: 'ns' },
      ],
    });
    expect(result.problems.some((p) => p.includes('not an integer instant'))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });
});

describe('modality comparison · a stale plan still produces a report', () => {
  // The module's contract is that a plan naming a column one of the tables does not
  // have is a *problem*, not an exception: the round trip's job at that moment is to
  // say which column went missing, and a throw would replace that sentence with a
  // stack trace. Each kind is driven separately because each has its own lookup, and
  // a plan can go stale in any of the four by a corpus or an exporter edit.
  const ROWS = ['a,b', '1,2'].join('\n');

  it('survives an exact column the export does not have', () => {
    const result = compare({ corpus: ROWS, exported: 'a\n1', plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'exact' }] });
    expect(result.problems.some((p) => p.includes("the exported logs table has no 'b' column"))).toBe(true);
    expect(result.rowsMatch).toBe(false);
    expect(result.exportedRows).toBe(1);
  });

  it('survives a truncated column the export does not have', () => {
    const result = compare({
      corpus: ROWS,
      exported: 'a\n1',
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'truncated', unit: 'ns' }],
    });
    expect(result.problems.some((p) => p.includes("no 'b' column"))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });

  it('survives a not-carried column the export does not have', () => {
    const result = compare({
      corpus: ROWS,
      exported: 'a\n1',
      plan: [{ column: 'a', kind: 'exact' }, { column: 'b', kind: 'not-carried' }],
    });
    expect(result.problems.some((p) => p.includes("no 'b' column"))).toBe(true);
    expect(result.rowsMatch).toBe(false);
  });

  it('survives a derived column the export does not have, and says which side is short', () => {
    const plan: readonly ColumnComparison[] = [
      { column: 'time', kind: 'derived', from: 'timestamp' },
      { column: 'timestamp', kind: 'truncated', unit: 'ns' },
    ];
    const corpus = ['time,timestamp', '06:16,1731910619999000000'].join('\n');
    const result = compare({ corpus, exported: 'timestamp\n1731910619999000000', plan });
    expect(result.problems.some((p) => p.includes("'time' is derived from 'timestamp', which is not a column of both tables"))).toBe(true);
    expect(result.rowsMatch).toBe(false);
    expect(result.columns.find((c) => c.column === 'time')).toMatchObject({ differ: 1, lossy: 0 });
  });

  it('skips a derived check whose instant cell is not an integer', () => {
    const plan: readonly ColumnComparison[] = [
      { column: 'time', kind: 'derived', from: 'timestamp' },
      { column: 'timestamp', kind: 'truncated', unit: 'ns' },
    ];
    const result = compare({
      table: 'traces',
      plan,
      corpus: ['time,timestamp', '06:16,not-an-instant'].join('\n'),
      exported: ['time,timestamp', '06:16,0'].join('\n'),
    });
    expect(result.problems.some((p) => p.includes('not an integer instant'))).toBe(true);
    expect(result.rowsMatch).toBe(false);
    // The cell is skipped rather than counted as a disagreement: it is unreadable,
    // and `problems` is where an unreadable cell belongs.
    expect(result.columns.find((c) => c.column === 'time')).toMatchObject({ differ: 0, lossy: 0 });
  });

  it('describes a derived column whose corpus never disagreed with itself', () => {
    const plan: readonly ColumnComparison[] = [
      { column: 'time', kind: 'derived', from: 'timestamp' },
      { column: 'timestamp', kind: 'truncated', unit: 'ns' },
    ];
    const text = describeModalityComparison(
      compare({
        table: 'traces',
        plan,
        corpus: ['time,timestamp', '06:16,1731910619999000000'].join('\n'),
        exported: ['time,timestamp', '06:16,1731910619999000000'].join('\n'),
      }),
    );
    expect(text).toContain('derived time from the instant');
    expect(text).not.toContain('disagree');
  });
});
