import { describe, expect, it } from 'vitest';
import {
  LOGTS_BUCKET_SECONDS,
  buildLogtsCsv,
  type LogCluster,
  type LogRow,
} from '../src/export/rcaeval-logts.js';
import { parseCsvRows as parseCsv } from '../src/util/csv.js';

/**
 * The `logts.csv` reduction, tested against the corpus's own arithmetic.
 *
 * Every fixture here is small and hand-built; the corpus-scale proof -- 97 rows by
 * 30 columns of `RE2-OB/checkoutservice_cpu/1`, 2910 cells, compared cell by cell
 * against the corpus's own file -- lives in `scripts/check-aggregate-tables.mjs`,
 * which runs where the archive is. What this file has to establish is the *rules*,
 * because a rule that is wrong in a way the corpus case does not exercise is a
 * rule that will be wrong on the next corpus.
 */
describe('logts.csv · the reduction the corpus performs', () => {
  const clusters: LogCluster[] = [
    { key: '1', container: 'currencyservice', template: 'conversion request successful' },
    { key: '2', container: 'frontend', template: 'request started' },
    { key: '3', container: 'frontend', template: 'serving product page' },
  ];

  function rows(...spec: [string, string, number][]): LogRow[] {
    return spec.map(([container, template, atSeconds]) => ({ container, template, atSeconds }));
  }

  function cells(csv: string): string[][] {
    return parseCsv(csv);
  }

  it('names a column for each cluster key, and orders them numerically', () => {
    // Built with keys `10` and `2` so a string sort is distinguishable from a
    // numeric one: the corpus's own keys run 1..30, where a string sort puts 10
    // before 2 and every column after the ninth lands in the wrong place.
    const table = buildLogtsCsv(rows(['frontend', 'request started', 0]), [
      { key: '10', container: 'frontend', template: 'request started' },
      { key: '2', container: 'cartservice', template: 'GetCartAsync' },
    ]);
    expect(cells(table.csv)[0]).toEqual(['time', 'cartservice_2', 'frontend_10']);
  });

  it('emits a dense grid at the corpus’s bucket width, including empty buckets', () => {
    // The corpus's case 1 has 97 rows spanning 1440 seconds: 96 steps of 15, with
    // no gaps. A sparse grid -- one row per bucket that happens to hold a log --
    // would produce a shorter file that a reader could not tell from a quiet run.
    expect(LOGTS_BUCKET_SECONDS).toBe(15);
    const table = buildLogtsCsv(
      rows(['frontend', 'request started', 0], ['frontend', 'request started', 45]),
      clusters,
    );
    const [header, ...body] = cells(table.csv);
    const at = (header as string[]).indexOf('frontend_2');
    expect(body.map((one) => one[0])).toEqual(['0', '15', '30', '45']);
    expect(body.map((one) => Number(one[at]))).toEqual([1, 0, 0, 1]);
  });

  it('puts an instant exactly on a boundary in that bucket, not the previous one', () => {
    // `floor` rather than `round`, stated as a test because the two agree on every
    // instant except the boundaries and the boundaries are where a case's
    // injection usually falls.
    const table = buildLogtsCsv(
      rows(['frontend', 'request started', 15], ['frontend', 'request started', 14]),
      clusters,
    );
    const [header, ...body] = cells(table.csv);
    const at = (header as string[]).indexOf('frontend_2');
    expect(body.map((one) => one[0])).toEqual(['0', '15']);
    expect(body.map((one) => Number(one[at]))).toEqual([1, 1]);
  });

  it('counts a row into its own cluster and not into its container’s other one', () => {
    // Two clusters share `frontend`; a count keyed by container alone would put
    // both templates in both columns, doubling the total.
    const table = buildLogtsCsv(
      rows(['frontend', 'request started', 0], ['frontend', 'request started', 0]),
      clusters,
    );
    const [header, row] = cells(table.csv);
    const started = (header as string[]).indexOf('frontend_2');
    const page = (header as string[]).indexOf('frontend_3');
    expect((row as string[])[started]).toBe('2');
    expect((row as string[])[page]).toBe('0');
  });

  it('counts a template two clusters share into both columns, rather than choosing', () => {
    // The corpus's `cluster_info.json` happens to give every key its own template,
    // so this rule is not exercised there. It is stated anyway because the
    // alternative -- silently picking one -- is a count that is wrong and looks
    // right.
    const table = buildLogtsCsv(rows(['frontend', 'request started', 0]), [
      { key: '1', container: 'frontend', template: 'request started' },
      { key: '2', container: 'frontend', template: 'request started' },
    ]);
    const [header, row] = cells(table.csv);
    expect((header as string[]).slice(1)).toEqual(['frontend_1', 'frontend_2']);
    expect((row as string[]).slice(1)).toEqual(['1', '1']);
  });

  it('drops a row no cluster describes, and says how many', () => {
    // The corpus's case 1 has twenty such rows -- `redis` lines whose
    // `log_template` is empty and which no cluster key names. They are not
    // assigned to the nearest column, and they are not silently gone either.
    const table = buildLogtsCsv(
      rows(['frontend', 'request started', 0], ['redis', '', 0], ['redis', '', 0]),
      clusters,
    );
    expect(table.dropped).toBe(2);
    const [header, row] = cells(table.csv);
    // No column was invented for the unmatched rows, and the one that did match
    // still counts.
    expect((header as string[]).filter((name) => name.startsWith('redis'))).toEqual([]);
    expect((row as string[])[(header as string[]).indexOf('frontend_2')]).toBe('1');
  });

  it('spans the grid over every row’s instant, not over the matched ones', () => {
    // The window is the log stream's. A dropped row still bounds the interval, so
    // an unmatched line at either end does not shorten the table -- the corpus's
    // grid covers the whole file, and `redis` writes to it at both ends.
    const table = buildLogtsCsv(
      rows(['redis', '', 0], ['frontend', 'request started', 45], ['redis', '', 45]),
      clusters,
    );
    expect(cells(table.csv).slice(1).map((one) => one[0])).toEqual(['0', '15', '30', '45']);
  });

  it('writes a header and no rows when there is nothing to reduce', () => {
    // With no rows there is no window, so there is no grid: the columns are still
    // named -- they come from the cluster table, not from the data -- and the file
    // is a header a reader can tell apart from a file that was never written.
    expect(buildLogtsCsv([], []).csv).toBe('time\n');
    const named = buildLogtsCsv([], clusters);
    expect(named.csv).toBe('time,currencyservice_1,frontend_2,frontend_3\n');
    expect(named.dropped).toBe(0);
  });

  it('emits each cluster key once even when the table names it twice', () => {
    // `cluster_info.json` is keyed by cluster and each key lists its containers,
    // so a reader that flattens it by (key, container) can produce the same column
    // twice. Writing it twice would produce a CSV with two identically named
    // columns, which every consumer would read as one of them.
    const table = buildLogtsCsv(rows(['frontend', 'request started', 0]), [
      { key: '1', container: 'frontend', template: 'request started' },
      { key: '1', container: 'frontend', template: 'request started' },
    ]);
    expect(cells(table.csv)[0]).toEqual(['time', 'frontend_1']);
    expect(cells(table.csv)[1]).toEqual(['0', '1']);
  });

  it('keeps a count exact past the width a 32-bit counter would hold', () => {
    const many: LogRow[] = [];
    for (let i = 0; i < 70_000; i += 1) {
      many.push({ container: 'frontend', template: 'request started', atSeconds: 0 });
    }
    const table = buildLogtsCsv(many, clusters);
    const [header, first] = cells(table.csv);
    expect((first as string[])[(header as string[]).indexOf('frontend_2')]).toBe('70000');
  });
});
