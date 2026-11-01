import { describe, expect, it } from 'vitest';
import {
  LOADER_DB_SUFFIX,
  assessCandidatePool,
  baselineWindow,
  describeEmptyBaseline,
  describeLabelFault,
  describeRenamedAnswer,
  loaderCandidates,
  loaderColumn,
  loaderLabel,
  readAsLoader,
} from '../src/export/loader-read.js';
import type { LoaderLabelFault, LoaderView } from '../src/export/loader-read.js';
import { casePath } from '../src/export/rcaeval.js';
import { SLI_SUFFIX, sliColumn } from '../src/export/sli.js';
import { validCase } from './fixtures.js';

/**
 * The loader's own arithmetic, run against tables this repository wrote.
 *
 * Every refusal below is a file the official harness would open and read *differently* from the way
 * our annotations mean it -- not a malformed file, which is what makes these worth asking: nothing
 * above them can see the disagreement, because both sides are well formed and only one of them is
 * the reader.
 */

const HEADER = ['time', 'checkout-api_request_duration_p99_ms', 'checkout-api-0_cpu_usage_ratio'];

describe('loaderLabel · the second path component, unpacked the way the loader unpacks it', () => {
  it('reads a service and a fault out of the three-component directory', () => {
    expect(loaderLabel('RE2-synthetic-storefront/checkout-api_cpu-saturation/1')).toEqual({
      service: 'checkout-api',
      fault: 'cpu-saturation',
    });
  });

  it('tolerates a trailing slash, because the loader walks directories rather than names', () => {
    expect(loaderLabel('RE2-OB/checkoutservice_cpu/1/')).toEqual({ service: 'checkoutservice', fault: 'cpu' });
  });

  it('refuses a path that is not three components, and says how many it found', () => {
    // `dirname(dirname(data_path))` of a two-component path is the suite directory, whose name
    // splits into one name -- and the loader unpacks two. This is the shape a flat export has.
    const fault = loaderLabel('RE2-checkout-api_cpu_1') as LoaderLabelFault;
    expect(fault).toEqual({ kind: 'shape', directory: 'RE2-checkout-api_cpu_1', components: 1 });
    expect(describeLabelFault(fault, 'history-checkout')).toContain('1 path component(s)');
  });

  it('refuses a fault label carrying an underscore, which upstream cannot unpack either', () => {
    // One case in the real RE3 corpus is `ts-route-service_f3_1`: three names out of a two-name
    // unpack. `parseRcaEvalPath` reads it (splitting at the first underscore) so the corpus can be
    // scored here; the loader cannot, and reproducing that is the point of this half.
    const fault = loaderLabel('RE3-TT/ts-route-service_f3_1/1') as LoaderLabelFault;
    expect(fault).toMatchObject({ kind: 'unpack', segment: 'ts-route-service_f3_1', names: 3 });
    expect(describeLabelFault(fault, 'ts-route-service-f3-1')).toContain('splits into 3 name(s)');
  });

  it('refuses a segment with no underscore at all', () => {
    const fault = loaderLabel('RE2-OB/checkoutservice/1') as LoaderLabelFault;
    expect(fault).toMatchObject({ kind: 'unpack', names: 1 });
    expect(describeLabelFault(fault, 'one-name')).toContain('1 name(s)');
  });
});

describe('loaderColumn · the name the loader looks for, derived from the path', () => {
  it('agrees with the column the exporter publishes, for every shape of component name', () => {
    // The exporter tokenises the component and appends the suffix; the loader takes the tokenised
    // path segment and appends the same suffix. This test derives the second from `casePath`'s own
    // output, so the two readings cannot drift into different spellings of one service.
    for (const component of ['checkout-api', 'order', 'ts-route-service', 'cartservice']) {
      const fc = validCase({ groundTruth: { ...validCase().groundTruth, rootCauseComponent: component } });
      const label = loaderLabel(casePath('RE2', fc, 1));
      expect(label).not.toHaveProperty('kind');
      const read = label as { service: string };
      expect(loaderColumn(read.service)).toBe(sliColumn(component));
      expect(loaderColumn(read.service).endsWith(SLI_SUFFIX)).toBe(true);
    }
  });

  it('does not re-tokenise: the segment it receives is already a token', () => {
    // `sliColumn` would turn `checkout_api` into `checkoutapi_latency`; this function must not,
    // because the loader does not. The disagreement is only reachable through this API -- a
    // component name with an underscore cannot reach a path -- and it is the difference the two
    // functions were kept separate for.
    expect(loaderColumn('checkout_api')).toBe('checkout_api_latency');
    expect(sliColumn('checkout_api')).toBe('checkoutapi_latency');
  });
});

describe('loaderCandidates · every column head read as a candidate service', () => {
  it('skips the time column and keeps the head beside the name it produced', () => {
    expect(loaderCandidates(HEADER)).toEqual([
      { head: 'checkout-api_request_duration_p99_ms', name: 'checkout-api', candidate: 'checkout-api' },
      { head: 'checkout-api-0_cpu_usage_ratio', name: 'checkout-api-0', candidate: 'checkout-api-0' },
    ]);
  });

  it('strips `-db` the way the loader strips it, anywhere in the head and once', () => {
    // `.replace("-db", "")` on the *candidate*, not on the head: `orders-db` becomes `orders`, and a
    // second occurrence would stay. Both are reproduced rather than tidied, because the loader is
    // the reader and a tidier version here would describe a consumer that does not exist.
    expect(loaderCandidates(['time', 'orders-db_commit_latency'])).toEqual([
      { head: 'orders-db_commit_latency', name: 'orders-db', candidate: 'orders' },
    ]);
    expect(loaderCandidates(['time', 'orders-db-db_x'])[0]!.candidate).toBe('orders-db');
    expect(LOADER_DB_SUFFIX).toBe('-db');
  });

  it('takes the first underscore-separated part, so a metric name never leaks into the candidate', () => {
    expect(loaderCandidates(['time', 'a_b_c'])[0]!.candidate).toBe('a');
  });

  it('reports no candidates for a header that is only the time column', () => {
    expect(loaderCandidates(['time'])).toEqual([]);
  });
});

describe('baselineWindow · the rows the loader keeps as "before"', () => {
  it('counts strictly before the injection instant', () => {
    // `main.py` filters with `<`, so a sample on the instant is on the after side. A case whose only
    // pre-injection sample sat exactly there would have an empty baseline for the loader and a
    // non-empty one for any reader who wrote `<=`.
    const window = baselineWindow([60, 120, 180, 240], 180);
    expect(window.rows).toBe(2);
    expect(window).toMatchObject({ earliest: 60, latest: 240, injectSeconds: 180 });
  });

  it('says zero rows when the whole table is after the injection', () => {
    expect(baselineWindow([300, 360], 180).rows).toBe(0);
  });

  it('sorts what it is given, because a table is not guaranteed to arrive in order', () => {
    expect(baselineWindow([240, 60, 180, 120], 180)).toMatchObject({ earliest: 60, latest: 240, rows: 2 });
  });

  it('drops a cell that is not a number rather than counting it', () => {
    // An empty or malformed `time` cell reads as `NaN`, and `NaN < inject` is false -- so it would
    // silently join the after side. Dropped, it is a row the window does not claim.
    expect(baselineWindow([Number.NaN, 60, 120], 180).rows).toBe(2);
    expect(baselineWindow([Number.NaN], 180)).toMatchObject({ rows: 0, earliest: 0, latest: 0 });
  });

  it('reports edges of zero for an empty table, which no case writes', () => {
    expect(baselineWindow([], 180)).toEqual({ rows: 0, earliest: 0, latest: 0, injectSeconds: 180 });
  });
});

describe('readAsLoader · the two files, read the way the loader reads them', () => {
  const base = {
    directory: 'RE2-synthetic-storefront/checkout-api_cpu-saturation/1',
    header: HEADER,
    times: [60, 120, 180, 240],
    injectSeconds: 180,
  };

  it('finds the column the path implies and the baseline the table carries', () => {
    const read = readAsLoader(base);
    expect(read.kind).toBe('read');
    const view = (read as { view: LoaderView }).view;
    expect(view).toMatchObject({
      directory: base.directory,
      column: 'checkout-api_latency',
      carries: false,
    });
    expect(view.label).toEqual({ service: 'checkout-api', fault: 'cpu-saturation' });
    expect(view.baseline.rows).toBe(2);
  });

  it('finds the column when the exporter published it', () => {
    const read = readAsLoader({ ...base, header: [...HEADER, 'checkout-api_latency'] });
    expect((read as { view: LoaderView }).view.carries).toBe(true);
  });

  it('refuses at the path rather than reporting a table it could not address', () => {
    const read = readAsLoader({ ...base, directory: 'RE2-synthetic-storefront/checkout-api/1' });
    expect(read).toEqual({
      kind: 'refused',
      fault: { kind: 'unpack', directory: 'RE2-synthetic-storefront/checkout-api/1', segment: 'checkout-api', names: 1 },
    });
  });
});

describe('the sentences a reader gets', () => {
  it('says which instants the table holds and which one it was injected at', () => {
    const view: LoaderView = {
      directory: 'RE2-x/cart-service_network-delay/2',
      label: { service: 'cart-service', fault: 'network-delay' },
      column: 'cart-service_latency',
      carries: false,
      baseline: { rows: 0, earliest: 300, latest: 360, injectSeconds: 180 },
    };
    const sentence = describeEmptyBaseline(view, 'history-cart');
    expect(sentence).toContain('writes 300..360');
    expect(sentence).toContain('injected at 180');
    expect(sentence).toContain('selects no row');
    expect(sentence.endsWith('.')).toBe(false);
  });

  it('names both spellings when the loader would rewrite an answer', () => {
    const sentence = describeRenamedAnswer({ caseId: 'x', entity: 'orders-db', candidate: 'orders' });
    expect(sentence).toContain("'x' names 'orders-db' as its root cause");
    expect(sentence).toContain("spells that name 'orders'");
    expect(sentence).toContain('cannot appear in the ranking');
  });
});

describe('assessCandidatePool · what the loader thinks our topology is made of', () => {
  const entities = [
    { name: 'checkout-api', kind: 'service' as const },
    { name: 'checkout-api-0', kind: 'pod' as const },
    { name: 'orders-db', kind: 'db' as const },
  ];

  it('sorts every candidate into a service, another kind of entity, and a name nobody wrote', () => {
    const pool = assessCandidatePool({
      candidates: loaderCandidates([
        'time',
        'checkout-api_latency',
        'checkout-api-0_cpu',
        'orders-db_commit_latency',
        'ghost_host_disk',
      ]),
      entities,
    });
    expect(pool.names).toEqual(['checkout-api', 'checkout-api-0', 'ghost', 'orders']);
    expect(pool.services).toEqual(['checkout-api']);
    // `orders` is not here: the database is `orders-db` in the graph, and the loader's rewrite is
    // what makes `orders` a name no entity carries -- a name the graph holds is never in this bucket.
    expect(pool.nonServices).toEqual(['checkout-api-0']);
    // `orders-db` is in the graph; the loader's rewrite is what makes `orders` a name no entity has.
    expect(pool.unknown).toEqual([
      { head: 'orders-db_commit_latency', name: 'orders-db', candidate: 'orders' },
      { head: 'ghost_host_disk', name: 'ghost', candidate: 'ghost' },
    ]);
    // One rewrite, and only the name that carries the suffix: `ghost` is unknown without being
    // rewritten, which is the second way a candidate can name nothing.
    expect(pool.rewritten).toEqual([{ head: 'orders-db_commit_latency', name: 'orders-db', candidate: 'orders' }]);
  });

  it('counts a name once however many columns carry it', () => {
    const pool = assessCandidatePool({
      candidates: loaderCandidates(['time', 'checkout-api_latency', 'checkout-api_rps']),
      entities,
    });
    expect(pool.names).toEqual(['checkout-api']);
    expect(pool.services).toEqual(['checkout-api']);
  });

  it('reports an empty pool for an empty table rather than a pool of nothing named', () => {
    const pool = assessCandidatePool({ candidates: [], entities });
    expect(pool).toEqual({ names: [], services: [], nonServices: [], unknown: [], rewritten: [] });
  });
});
