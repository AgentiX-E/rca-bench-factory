import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  LOG_OFFSETS_MS,
  SERIES_DERIVATIONS,
  SERIES_POINTS,
  SERIES_STEP_MS,
  TRACE_OFFSET_MS,
  expandLog,
  expandSeries,
  expandTraces,
  type SeriesDeclaration,
} from '../src/fault/derived-telemetry.js';

/**
 * The samples a declaration becomes.
 *
 * This module lived inside `scripts/check-fault-cases.mjs` until finding 249, and the reason it is
 * here is the first test below: a counter's pre-window was written `baseline + 0.1 * index`, so a
 * counter with a baseline of zero was **already accumulating before the fault** -- the opposite of
 * what the text said. Nothing observed the values the expansion produced (the guard prints counts of
 * files, not samples), so no test could disagree with it. Every test here asserts a *number*, and the
 * numbers are written out rather than recomputed from the constants.
 */

const WHEN = { windowStart: '2026-09-23T09:08:00.000Z', onset: '2026-09-23T09:20:00.000Z' };

function values(declaration: SeriesDeclaration): number[] {
  return expandSeries(declaration, WHEN).map((one) => (one.payload as { value: number }).value);
}

function timestamps(declaration: SeriesDeclaration): string[] {
  return expandSeries(declaration, WHEN).map((one) => one.timestamp);
}

describe('expandSeries · the shape each derivation means', () => {
  it('steps: the whole pre-window sits around the baseline and the whole post-window at the post', () => {
    // The jitter is a fixed cycle of ±2 %, so the numbers are exact: 100 is 100, 102, 98, 101, 99,
    // 101.6, 98.4, 100.6, and the post values are the same cycle around 300.
    const declaration: SeriesDeclaration = {
      service: 'checkout-api',
      metric: 'request_duration_p99_ms',
      unit: 'ms',
      baseline: 100,
      post: 300,
    };
    expect(values(declaration)).toEqual([
      100, 102, 98, 101, 99, 101.6, 98.4, 100.6, 300, 306, 294, 303, 297, 304.8, 295.2, 301.8,
    ]);
  });

  it('steps by default: an absent derivation is a level change, not an error', () => {
    expect(values({ service: 's', metric: 'm', baseline: 10, post: 20 })).toHaveLength(SERIES_POINTS * 2);
    expect(values({ service: 's', metric: 'm', baseline: 10, post: 20 })[SERIES_POINTS]).toBe(20);
  });

  it('counts: the pre-window is flat at the baseline and the post-window accumulates to exactly post', () => {
    // The defect this module was extracted for. A counter that had accumulated 12 by the start of the
    // window sat at 12 for the whole pre-window; the first version wrote 12, 12.1, 12.2, 12.3, which
    // is a rate nobody declared.
    const declaration: SeriesDeclaration = {
      service: 'checkout-api-0',
      metric: 'container_cpu_throttled_seconds_total',
      unit: 's',
      baseline: 12,
      post: 96,
      derivation: 'counter',
    };
    const sample = values(declaration);
    expect(sample.slice(0, SERIES_POINTS)).toEqual([12, 12, 12, 12, 12, 12, 12, 12]);
    // (96 - 12) / 8 = 10.5 per sample, so the last post sample is exactly the declared post value.
    expect(sample.slice(SERIES_POINTS)).toEqual([22.5, 33, 43.5, 54, 64.5, 75, 85.5, 96]);
    expect(sample.at(-1)).toBe(96);
  });

  it('counts from zero: nothing accumulated before the onset, which is what "began" means', () => {
    // The case that found it: `ingress_504_responses_total` with a baseline of 0. A pre-window of
    // 0, 0.1, 0.2, 0.3 is a claim that failures were already happening before the change.
    const declaration: SeriesDeclaration = {
      service: 'partner-portal',
      metric: 'ingress_504_responses_total',
      unit: 'count',
      baseline: 0,
      post: 1,
      derivation: 'counter',
    };
    const sample = values(declaration);
    expect(sample.slice(0, SERIES_POINTS)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sample.slice(SERIES_POINTS)).toEqual([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
  });

  it('spikes: one sample at the post value and then back to the baseline', () => {
    const declaration: SeriesDeclaration = {
      service: 'cart-service',
      metric: 'client_span_duration_ms',
      unit: 'ms',
      baseline: 12,
      post: 900,
      derivation: 'spike',
    };
    const sample = values(declaration);
    expect(sample[SERIES_POINTS]).toBe(900);
    // The return is baseline-sized, and the jitter still applies to it -- a spike that returned to
    // exactly 12 while its baseline samples moved would be a different series from the one before.
    expect(sample.slice(SERIES_POINTS + 1)).toEqual([12.24, 11.76, 12.12, 11.88, 12.192, 11.808, 12.072]);
  });

  it('carries the unit only when the declaration has one', () => {
    const withUnit = expandSeries({ service: 's', metric: 'm', unit: 'ms', baseline: 1, post: 2 }, WHEN);
    expect(withUnit[0]?.payload).toMatchObject({ kind: 'metric', name: 'm', unit: 'ms' });
    const without = expandSeries({ service: 's', metric: 'm', baseline: 1, post: 2 }, WHEN);
    expect(without[0]?.payload).not.toHaveProperty('unit');
  });

  it('names the service in the resource and reads the metric name from the declaration', () => {
    const [first] = expandSeries({ service: 'partner-portal', metric: 'upload_handler_seconds', baseline: 8, post: 8 }, WHEN);
    expect(first).toMatchObject({
      irVersion: '1.0.0',
      resource: { 'service.name': 'partner-portal' },
      signal: 'metric',
      payload: { kind: 'metric', name: 'upload_handler_seconds' },
    });
  });
});

describe('expandSeries · the timestamps', () => {
  it('places the pre-window on the window start and the post-window on the onset', () => {
    const stamps = timestamps({ service: 's', metric: 'm', baseline: 1, post: 2 });
    expect(stamps[0]).toBe('2026-09-23T09:08:00.000Z');
    expect(stamps[1]).toBe('2026-09-23T09:09:30.000Z');
    expect(stamps[SERIES_POINTS]).toBe('2026-09-23T09:20:00.000Z');
    expect(stamps.at(-1)).toBe('2026-09-23T09:30:30.000Z');
  });

  it('stops the pre-window at the onset rather than crossing it', () => {
    // A window that opens ninety seconds before the onset can only hold one pre-onset sample: the
    // loop breaks rather than placing a sample at or after the onset in the "before" half.
    const short = { windowStart: '2026-09-23T09:18:30.000Z', onset: '2026-09-23T09:20:00.000Z' };
    const sample = expandSeries({ service: 's', metric: 'm', baseline: 1, post: 2 }, short);
    expect(sample).toHaveLength(1 + SERIES_POINTS);
    expect(sample[1]?.timestamp).toBe('2026-09-23T09:20:00.000Z');
  });

  it('uses a ninety-second cadence, and the length of the window is not consulted', () => {
    expect(SERIES_STEP_MS).toBe(90_000);
  });
});

describe('expandLog · three lines after the onset', () => {
  const declaration = { service: 'partner-portal', body: 'upload handled in 8210 ms', severity: 'INFO' as const };

  it('lands at the declared offsets, all after the onset', () => {
    const lines = expandLog(declaration, WHEN);
    expect(lines).toHaveLength(LOG_OFFSETS_MS.length);
    expect(lines.map((one) => one.timestamp)).toEqual([
      '2026-09-23T09:20:30.000Z',
      '2026-09-23T09:22:30.000Z',
      '2026-09-23T09:24:30.000Z',
    ]);
  });

  it('carries the body and the severity', () => {
    expect(expandLog(declaration, WHEN)[0]).toMatchObject({
      resource: { 'service.name': 'partner-portal' },
      signal: 'log',
      payload: { kind: 'log', body: 'upload handled in 8210 ms', severityText: 'INFO' },
    });
  });

  it('omits the severity when the declaration does', () => {
    expect(expandLog({ service: 's', body: 'a line' }, WHEN)[0]?.payload).not.toHaveProperty('severityText');
  });
});

describe('expandTraces · ids that are identities', () => {
  const spans = [
    { service: 'cart-service', spanName: 'POST /cart/checkout', durationMs: 900 },
    { service: 'inventory-service', spanName: 'reserve_stock', durationMs: 11, parent: 'POST /cart/checkout' },
  ];

  it('derives the ids from the case id and shares one trace id', () => {
    const [parent, child] = expandTraces(spans, WHEN, 'history-cart-network-delay');
    const traceId = (parent?.payload as { traceId: string }).traceId;
    expect(traceId).toMatch(/^[0-9a-f]{12}trace$/);
    expect((child?.payload as { traceId: string }).traceId).toBe(traceId);
  });

  it('keeps two case ids apart when they agree for twelve characters', () => {
    // The defect the digest replaced: a twelve-character *prefix* of the name collides for any two
    // cases that agree that far, and one case's trace then points into the other's. A prefix is a
    // name, not an identity -- and this is the assertion that could not exist while the function
    // lived in a script.
    const [a] = expandTraces([spans[0]!], WHEN, 'history-checkout-alpha');
    const [b] = expandTraces([spans[0]!], WHEN, 'history-checkout-beta');
    expect((a?.payload as { spanId: string }).spanId).not.toBe((b?.payload as { spanId: string }).spanId);
  });

  it('resolves a parent to the parent span id, not to its name', () => {
    const [parent, child] = expandTraces(spans, WHEN, 'history-cart-network-delay');
    expect((child?.payload as { parentSpanId: string }).parentSpanId).toBe(
      (parent?.payload as { spanId: string }).spanId,
    );
  });

  it('lands every span at the declared offset after the onset', () => {
    expect(expandTraces(spans, WHEN, 'c').map((one) => one.timestamp)).toEqual([
      new Date(Date.parse(WHEN.onset) + TRACE_OFFSET_MS).toISOString(),
      new Date(Date.parse(WHEN.onset) + TRACE_OFFSET_MS).toISOString(),
    ]);
  });

  it('carries the duration and omits parentSpanId for a root span', () => {
    const [parent] = expandTraces(spans, WHEN, 'c');
    expect(parent?.payload).toMatchObject({ kind: 'trace', spanName: 'POST /cart/checkout', durationMs: 900 });
    expect(parent?.payload).not.toHaveProperty('parentSpanId');
  });
});

describe('the vocabulary', () => {
  it('is the three shapes the corpus can express', () => {
    expect(SERIES_DERIVATIONS).toEqual(['step', 'counter', 'spike']);
  });
});

describe('the published description', () => {
  // The document is the specification a reviewer reads, and it lists the three shapes by name. That
  // list is a copy of `SERIES_DERIVATIONS`, so it is checked like one: `check-data-model-vocabularies`
  // covers the vocabularies a zod schema admits, and this one reaches no schema -- a signals file is
  // read by the guard, not parsed -- so the comparison lives here rather than being left to drift.
  const DOC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'data-model.md');

  it('names exactly the members of SERIES_DERIVATIONS, in order', () => {
    const text = readFileSync(DOC, 'utf8');
    const lines = text.split('\n');
    const start = lines.findIndex((one) => one.startsWith('`derivation` is a closed vocabulary'));
    expect(start, 'the paragraph describing `derivation` is gone from docs/data-model.md').toBeGreaterThan(-1);
    // The paragraph, not the line: markdown wraps, and a check that reads one line would have found
    // two of the three members and passed for the wrong reason.
    const paragraph: string[] = [];
    for (const line of lines.slice(start)) {
      if (line.trim() === '') break;
      paragraph.push(line);
    }
    const named = [...paragraph.join(' ').matchAll(/`(step|counter|spike)`/g)].map((match) => match[1]);
    expect(named).toEqual([...SERIES_DERIVATIONS]);
  });

  it('states the cadence and the offsets the module implements', () => {
    const text = readFileSync(DOC, 'utf8');
    expect(text).toContain(`onset + ${String(LOG_OFFSETS_MS[0]! / 1000)}s`);
    expect(text).toContain(`onset + ${String(TRACE_OFFSET_MS / 1000)}s`);
    expect(text).toContain('ninety-second');
  });
});
