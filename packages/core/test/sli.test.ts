import { describe, expect, it } from 'vitest';
import {
  SLI_SUFFIX,
  describeSliFault,
  readSliDeclaration,
  resolveSli,
  sliColumn,
} from '../src/export/sli.js';
import type { SliFault } from '../src/export/sli.js';
import { buildDataCsv, casePath } from '../src/export/rcaeval.js';
import { caseToken, faultToken } from '../src/export/tokens.js';
import { MIN_SENTENCE_LENGTH, looksLikeSentence } from '../src/util/prose.js';
import type { TelemetrySignal } from '../src/ir/types.js';
import { metricAt, validCase } from './fixtures.js';

/**
 * The declaration, and the name upstream will look for.
 *
 * Every refusal below is a case whose `data.csv` would have left `main.py` ranking by a column it
 * could not find -- or, worse, finding one that holds a different quantity than its name claims.
 *
 * The sentence used as a valid reason is deliberately one the corpus could carry: the guard checks
 * length and a closing stop, and whether the sentence is *true* is a reader's job (finding 326).
 */
const REASON =
  'the only series on this service is a share of failed writes, and a share published under a ' +
  'latency name would be a different quantity wearing it.';

/**
 * The header of the metric table, which is where the alias either appears or does not.
 *
 * Read through the exporter rather than through a map built here: a helper that spelled the column
 * its own way would agree with itself and prove nothing.
 */
function headerOf(signals: readonly TelemetrySignal[], publish?: { from: string; to: string }): string[] {
  return buildDataCsv([...signals], publish).split('\n')[0]!.split(',');
}

describe('readSliDeclaration · what the file says', () => {
  it('reads the pair a component carries, and names the column it becomes', () => {
    const read = readSliDeclaration({
      sli: { service: 'checkout-api', metric: 'request_duration_p99_ms' },
      component: 'checkout-api',
    });
    expect(read.fault).toBeNull();
    expect(read.declaration).toEqual({ service: 'checkout-api', metric: 'request_duration_p99_ms' });
    expect(read.column).toBe('checkout-api_latency');
    expect(read.column?.endsWith(SLI_SUFFIX)).toBe(true);
  });

  it('reads a reason for having no ranking reading, and claims no column', () => {
    const read = readSliDeclaration({ sli: { none: REASON }, component: 'checkout-api' });
    expect(read.fault).toBeNull();
    expect(read.declaration).toEqual({ none: REASON });
    // A case that says nothing ranks it publishes nothing under the name upstream asks for -- the
    // quiet answer and the missing one are different, and only the missing one is a fault.
    expect(read.column).toBeNull();
  });

  it('refuses a case that says nothing at all', () => {
    expect(readSliDeclaration({ sli: undefined, component: 'checkout-api' }).fault).toEqual({
      kind: 'absent',
    });
    expect(readSliDeclaration({ sli: null, component: 'checkout-api' }).fault).toEqual({ kind: 'absent' });
  });

  it('refuses a declaration that is not an object, and says what it is', () => {
    for (const [value, why] of [
      ['checkout-api', 'is a string'],
      [42, 'is a number'],
      [[{ service: 'a', metric: 'b' }], 'is an array'],
    ] as const) {
      const read = readSliDeclaration({ sli: value, component: 'checkout-api' });
      expect(read.fault, String(value)).toEqual({ kind: 'unreadable', sli: value, why });
      expect(read.declaration).toBeNull();
    }
  });

  it('refuses a declaration that names a reading and a reason at once', () => {
    const read = readSliDeclaration({
      sli: { service: 'checkout-api', metric: 'request_duration_p99_ms', none: REASON },
      component: 'checkout-api',
    });
    expect(read.fault).toMatchObject({ kind: 'unreadable', why: 'names a reading and a reason at the same time' });
  });

  it('refuses a declaration that names neither', () => {
    expect(readSliDeclaration({ sli: {}, component: 'checkout-api' }).fault).toMatchObject({
      kind: 'unreadable',
      why: 'names neither a reading nor a reason',
    });
    // Half a pair is the same refusal: the file did not finish saying what it meant.
    expect(readSliDeclaration({ sli: { service: 'checkout-api' }, component: 'checkout-api' }).fault).toMatchObject({
      kind: 'unreadable',
      why: 'names neither a reading nor a reason',
    });
  });

  it('refuses an empty service or metric, which would name a column no path builds', () => {
    for (const sli of [
      { service: '', metric: 'request_duration_p99_ms' },
      { service: 'checkout-api', metric: '' },
      { service: 7, metric: 'request_duration_p99_ms' },
    ]) {
      expect(readSliDeclaration({ sli, component: 'checkout-api' }).fault, JSON.stringify(sli)).toMatchObject({
        kind: 'unreadable',
        why: 'names a reading with an empty service or metric',
      });
    }
  });

  it('refuses a reason that is not text', () => {
    expect(readSliDeclaration({ sli: { none: 12 }, component: 'checkout-api' }).fault).toMatchObject({
      kind: 'unreadable',
      why: 'states a reason that is not text',
    });
  });

  it('refuses a reason that is a label rather than a sentence', () => {
    const read = readSliDeclaration({ sli: { none: 'no latency' }, component: 'checkout-api' });
    expect(read.fault).toEqual({ kind: 'vague', reason: 'no latency' });
    // The floor is shared with `fault/parameter-notes.ts`, so a reason and a note are held to one
    // rule rather than two that look alike.
    expect(looksLikeSentence(`${'x'.repeat(MIN_SENTENCE_LENGTH - 2)}.`)).toBe(false);
    expect(looksLikeSentence('x'.repeat(MIN_SENTENCE_LENGTH))).toBe(false);
    expect(looksLikeSentence('x'.repeat(MIN_SENTENCE_LENGTH) + '.')).toBe(true);
  });

  it('refuses a reading on a service the path does not name', () => {
    // The column is named after the path, which is named after the answer key: publishing another
    // service's numbers under it is the one thing the alias must not do.
    const read = readSliDeclaration({
      sli: { service: 'cart-service', metric: 'client_span_duration_ms' },
      component: 'checkout-api',
    });
    expect(read.fault).toEqual({ kind: 'foreign', service: 'cart-service', component: 'checkout-api' });
    expect(read.column).toBeNull();
  });

  it('compares services by the token the path is built from, not by the raw string', () => {
    // `checkout_api` and `checkout-api` are different tokens, and the difference is exactly what the
    // path would carry: the underscore is stripped, so the column would be `checkoutapi_latency`
    // while the path says `checkout-api`. Refusing it is what keeps one spelling.
    expect(caseToken('checkout_api')).toBe('checkoutapi');
    expect(caseToken('checkout-api')).toBe('checkout-api');
    expect(
      readSliDeclaration({ sli: { service: 'checkout_api', metric: 'x_ms' }, component: 'checkout-api' })
        .fault,
    ).toMatchObject({ kind: 'foreign' });
    // The fault half keeps underscores, which is the corpus's own reading of the label.
    expect(faultToken('f3_1')).toBe('f3_1');
    expect(faultToken('f3 1')).toBe('f31');
    // A token that sanitises to nothing would collapse the segment into `service_`, which reads as a
    // fault with an empty name rather than as a name with no fault.
    expect(faultToken('_-_')).toBe('unnamed');
    expect(caseToken('___')).toBe('unnamed');
  });
});

describe('resolveSli · what the data says', () => {
  it('publishes the declared series under the name upstream looks for', () => {
    const signals = [
      metricAt(0, 'request_duration_p99_ms', 180, 'checkout-api', 'ms'),
      metricAt(60, 'request_duration_p99_ms', 4300, 'checkout-api', 'ms'),
    ];
    const resolution = resolveSli({
      declaration: { service: 'checkout-api', metric: 'request_duration_p99_ms' },
      signals,
    });
    expect(resolution.fault).toBeNull();
    expect(resolution.publish).toEqual({
      from: 'checkout-api_request_duration_p99_ms',
      to: 'checkout-api_latency',
    });
  });

  it('has nothing to publish for a case that says nothing ranks it', () => {
    const resolution = resolveSli({ declaration: { none: REASON }, signals: [] });
    expect(resolution).toEqual({ fault: null, publish: null });
  });

  it('refuses a declaration the case carries no series for, and lists what it does carry', () => {
    const signals = [
      metricAt(0, 'container_restarts_total', 3, 'checkout-api', 'count'),
      metricAt(0, 'request_duration_p99_ms', 180, 'checkout-api', 'ms'),
    ];
    const resolution = resolveSli({
      declaration: { service: 'checkout-api', metric: 'request_duration_p50_ms' },
      signals,
    });
    expect(resolution.fault).toEqual({
      kind: 'unresolved',
      service: 'checkout-api',
      metric: 'request_duration_p50_ms',
      carries: ['checkout-api_container_restarts_total', 'checkout-api_request_duration_p99_ms'],
    });
    expect(resolution.publish).toBeNull();
  });

  it('refuses a share, because the column it would be published under says latency', () => {
    const signals = [metricAt(0, 'summary_5xx_ratio', 0.9, 'reporting-service', '1')];
    const resolution = resolveSli({
      declaration: { service: 'reporting-service', metric: 'summary_5xx_ratio' },
      signals,
    });
    expect(resolution.fault).toEqual({ kind: 'notDuration', metric: 'summary_5xx_ratio', unit: '1' });
  });

  it('refuses a series with no unit, and one whose unit is not in the table', () => {
    const bare: TelemetrySignal[] = [
      metricAt(0, 'latency_hint', 12, 'checkout-api', undefined as unknown as string),
    ];
    delete (bare[0]!.payload as { unit?: string }).unit;
    expect(
      resolveSli({ declaration: { service: 'checkout-api', metric: 'latency_hint' }, signals: bare }).fault,
    ).toEqual({ kind: 'notDuration', metric: 'latency_hint', unit: '(no unit)' });

    // `dimensionOf` throws on a unit it does not know, and a reading in a unit nobody can convert is
    // not one this exporter can publish under a name that claims to know its dimension.
    const unknown = [metricAt(0, 'latency_hint', 12, 'checkout-api', 'furlong')];
    expect(
      resolveSli({ declaration: { service: 'checkout-api', metric: 'latency_hint' }, signals: unknown }).fault,
    ).toEqual({ kind: 'notDuration', metric: 'latency_hint', unit: 'furlong' });
  });

  it('refuses to overwrite a column that already has the name it wants', () => {
    // Two series, one of them already called `checkout-api_latency`. The alias would replace that
    // series' numbers with these, under a name a reader has no way to tell apart.
    const signals = [
      metricAt(0, 'latency', 900, 'checkout-api', 'ms'),
      metricAt(0, 'request_duration_p99_ms', 180, 'checkout-api', 'ms'),
    ];
    const resolution = resolveSli({
      declaration: { service: 'checkout-api', metric: 'request_duration_p99_ms' },
      signals,
    });
    expect(resolution.fault).toEqual({ kind: 'collision', column: 'checkout-api_latency' });
  });

  it('is the identity when the case already names its series the way upstream asks', () => {
    const signals = [metricAt(0, 'latency', 180, 'checkout-api', 'ms')];
    const resolution = resolveSli({ declaration: { service: 'checkout-api', metric: 'latency' }, signals });
    expect(resolution.fault).toBeNull();
    expect(resolution.publish).toEqual({ from: 'checkout-api_latency', to: 'checkout-api_latency' });
  });
});

describe('the name, derived from the path rather than restated', () => {
  it('is the column upstream constructs from the directory it walks', () => {
    // `main.py` does `service, metric = basename(dirname(dirname(data_path))).split("_")` and then
    // looks for `f"{service}_latency"`. This test takes the path this exporter writes, applies those
    // two lines to it, and requires the answer to be the column sliColumn produces -- so the two
    // cannot drift into different spellings of one service.
    for (const component of ['checkout-api', 'order', 'ts-route-service']) {
      const fc = validCase({ groundTruth: { ...validCase().groundTruth, rootCauseComponent: component } });
      const segments = casePath('RE2', fc, 1).split('/');
      const upstreamService = segments[1]!.split('_')[0];
      expect(sliColumn(component)).toBe(`${upstreamService}${SLI_SUFFIX}`);
      // And the table says so: the declared series leaves the exporter under the derived name, with
      // its own name gone rather than beside it.
      const signals = [metricAt(0, 'request_duration_p99_ms', 1, component, 'ms')];
      expect(headerOf(signals, { from: `${component}_request_duration_p99_ms`, to: sliColumn(component) })).toEqual([
        'time',
        `${component}_latency`,
      ]);
    }
  });
});

describe('the sentence a reader gets', () => {
  it('names the case and the thing to repair, for every way a declaration falls short', () => {
    const faults: SliFault[] = [
      { kind: 'absent' },
      { kind: 'unreadable', sli: 'x', why: 'is a string' },
      { kind: 'foreign', service: 'cart-service', component: 'checkout-api' },
      { kind: 'vague', reason: 'no latency' },
      { kind: 'unresolved', service: 'checkout-api', metric: 'p50', carries: ['checkout-api_cpu'] },
      { kind: 'notDuration', metric: 'ratio', unit: '1' },
      { kind: 'collision', column: 'checkout-api_latency' },
      // A case with no telemetry at all, asked what ranks it: the list it carries is empty, and the
      // sentence says so rather than printing a bracket with nothing inside. Reachable through this
      // module's own API, which is why the arm exists.
      { kind: 'unresolved', service: 'checkout-api', metric: 'p50', carries: [] },
    ];
    const sentences = faults.map((fault) => describeSliFault(fault, 'history-checkout'));
    for (const [index, sentence] of sentences.entries()) {
      expect(sentence.startsWith("'history-checkout'"), sentences[index]).toBe(true);
      expect(sentence.length).toBeGreaterThan(60);
    }
    // Each one names what to look at, and no two say the same thing -- the kinds are separate
    // repairs, not a severity scale.
    expect(new Set(sentences).size).toBe(faults.length);
    expect(sentences[2]).toContain("cart-service");
    expect(sentences[2]).toContain("'checkout-api'");
    expect(sentences[4]).toContain('checkout-api_cpu');
    expect(sentences[5]).toContain("'1'");
    expect(sentences[7]).toContain('carries: nothing');
  });
});
