import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BACKGROUND_SCHEMA,
  backgroundProblems,
  backgroundSeries,
  parseBackground,
  type BackgroundSeries,
} from '../src/fault/background.js';
import type { EntityGraph } from '../src/ir/types.js';

/**
 * The background is the corpus's other half of telemetry, and it has exactly one job: to make "the
 * answer is within the top 3" a sentence that can be false.
 *
 * Everything here is about keeping it from doing a second job. It may not assert anything about an
 * incident (no quotes, and no checkpoint may cite it), it may not move (a flat series is the null
 * hypothesis, and a jittered one ranks the quiet services by floating-point rounding), and it may
 * not be a subset of the system (an omitted service is a candidate that never competed).
 */

const GRAPH: EntityGraph = {
  entities: [
    { entityId: 'service:default/cart', kind: 'service', name: 'cart', aliases: [] },
    { entityId: 'service:default/checkout', kind: 'service', name: 'checkout', aliases: [] },
    { entityId: 'pod:default/checkout-0', kind: 'pod', name: 'checkout-0', aliases: [] },
  ],
  edges: [{ from: 'service:default/checkout', to: 'pod:default/checkout-0', relation: 'contains' }],
};

const SERIES: BackgroundSeries[] = [
  { service: 'cart', metric: 'request_rate', unit: 'rps', value: 190 },
  { service: 'checkout', metric: 'request_rate', unit: 'rps', value: 85 },
];

function file(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: BACKGROUND_SCHEMA,
    why: 'The system at its ordinary request rates, flat, one series per service in the graph.',
    series: SERIES.map((one) => ({ ...one })),
    ...overrides,
  };
}

function problemsOf(raw: unknown): string[] {
  const parsed = parseBackground(raw);
  return 'problems' in parsed ? parsed.problems : [];
}

describe('reading a background declaration', () => {
  it('accepts the shipped shape', () => {
    const parsed = parseBackground(file());
    expect('declaration' in parsed).toBe(true);
    expect('declaration' in parsed ? parsed.declaration.series : []).toHaveLength(2);
  });

  it('refuses a schema it does not read, rather than guessing', () => {
    // The schema string is the only thing that says which rules apply. A file written for a later
    // version read under this one would satisfy these checks by accident and be wrong deliberately.
    expect(problemsOf(file({ schema: 'rca-bench-background-telemetry/2' }))).toContainEqual(
      expect.stringContaining("this repository reads 'rca-bench-background-telemetry/1'"),
    );
    expect(problemsOf(file({ schema: undefined }))).toHaveLength(1);
  });

  it('refuses a file with no reason, because the reason is what a reviewer reads', () => {
    expect(problemsOf(file({ why: 'background' }))).toEqual([
      'does not say in at least forty characters why the background exists',
    ]);
  });

  it('refuses an empty series list, which would widen nothing', () => {
    expect(problemsOf(file({ series: [] }))).toEqual(['declares no series, so it widens no ranking']);
  });

  it('refuses two entries for one service and metric', () => {
    // A duplicate is not a tie: the ranking is keyed on the service, so the second entry would
    // silently win and the first would be a number nothing read.
    const twice = [...SERIES, { service: 'cart', metric: 'request_rate', value: 12 }];
    expect(problemsOf(file({ series: twice }))).toContainEqual(
      expect.stringContaining("declares 'cart|request_rate' twice"),
    );
  });

  it('refuses a value that is not a number, and says which pair it was', () => {
    const wrong = [{ service: 'cart', metric: 'request_rate', value: '190' }];
    expect(problemsOf(file({ series: wrong }))).toContainEqual(
      expect.stringContaining("declares 'cart|request_rate' with a value of \"190\""),
    );
  });

  it('refuses a unit that is not a string', () => {
    const wrong = [{ service: 'cart', metric: 'request_rate', unit: 1, value: 190 }];
    expect(problemsOf(file({ series: wrong }))).toContainEqual(
      expect.stringContaining('with a unit that is not a string'),
    );
  });

  it('refuses a file that is not an object at all', () => {
    // `null`, a string, a number: the three things `JSON.parse` returns when the file holds
    // something other than a declaration. Each is reported as a missing schema rather than thrown.
    for (const raw of [null, 'background', 3]) {
      expect(problemsOf(raw)).toEqual([
        expect.stringContaining('declares schema undefined'),
        'does not say in at least forty characters why the background exists',
        'declares no series, so it widens no ranking',
      ]);
    }
  });

  it('reads a series field that is not a list as no series at all', () => {
    // A hand-edited file can hold `"series": "cart"`. Reading it as one entry would put the string
    // through the entry checks and report a unitless series; reading it as nothing reports the one
    // thing that is true.
    expect(problemsOf(file({ series: 'cart' }))).toEqual(['declares no series, so it widens no ranking']);
  });

  it('refuses an entry that is not an object, and one with a field of the wrong type', () => {
    expect(problemsOf(file({ series: ['cart'] }))).toEqual(['declares a background series with no service or no metric']);
    expect(problemsOf(file({ series: [{ metric: 'request_rate', value: 1 }] }))).toEqual([
      'declares a background series with no service or no metric',
    ]);
    expect(problemsOf(file({ series: [{ service: 'cart', value: 1 }] }))).toEqual([
      'declares a background series with no service or no metric',
    ]);
  });

  it('accepts an entry with no unit, because a rate is not always written in one', () => {
    const parsed = parseBackground(file({ series: [{ service: 'cart', metric: 'request_rate', value: 190 }] }));
    expect('declaration' in parsed ? parsed.declaration.series : []).toEqual([
      { service: 'cart', metric: 'request_rate', value: 190 },
    ]);
  });

  it('reports every defect at once, because a file with three is one repair', () => {
    // Collected rather than thrown one at a time: a reader who fixes them in sequence runs the guard
    // once per defect to see the last one.
    const broken = file({ schema: 'x', why: 'short', series: [{ service: '', metric: '' }] });
    expect(problemsOf(broken)).toEqual([
      expect.stringContaining("declares schema \"x\""),
      'does not say in at least forty characters why the background exists',
      'declares a background series with no service or no metric',
    ]);
  });
});

describe('the background is the system, or the numbers mean something else', () => {
  it('refuses an entry for an entity the graph does not hold', () => {
    const problems = backgroundProblems(
      { why: 'x'.repeat(40), series: [...SERIES, { service: 'ghost', metric: 'request_rate', value: 1 }] },
      GRAPH,
    );
    expect(problems).toEqual([
      "declares a series for 'ghost', which is not a service in the graph (it holds: cart, checkout)",
    ]);
  });

  it('refuses a background that omits a service the graph holds', () => {
    // The omission is the interesting direction: it is the narrow ranking this file exists to end,
    // reintroduced one service at a time, and nothing else in the corpus would notice.
    const problems = backgroundProblems({ why: 'x'.repeat(40), series: [SERIES[0]!] }, GRAPH);
    expect(problems).toEqual([expect.stringContaining("omits the service 'checkout'")]);
  });

  it('counts a pod as an entity the background may not name', () => {
    // A pod's request rate is its service's request rate under another name, and a ranking that
    // held both would score a method twice for one finding.
    const problems = backgroundProblems(
      { why: 'x'.repeat(40), series: [...SERIES, { service: 'checkout-0', metric: 'request_rate', value: 1 }] },
      GRAPH,
    );
    expect(problems).toEqual([expect.stringContaining("'checkout-0', which is not a service")]);
  });

  it('accepts the whole system and says nothing', () => {
    expect(backgroundProblems({ why: 'x'.repeat(40), series: SERIES }, GRAPH)).toEqual([]);
  });
});

describe('what the background contributes to a case', () => {
  it('emits one flat series per service, with no noise', () => {
    // Exactly flat is the claim: the rest of the system was ordinary. It also makes every quiet
    // statistic exactly zero, so `locatedRank` reads a quiet answer as absent rather than as the
    // third of the services that showed nothing.
    expect(backgroundSeries([], SERIES)).toEqual([
      { service: 'cart', metric: 'request_rate', unit: 'rps', baseline: 190, post: 190, noise: 'none' },
      { service: 'checkout', metric: 'request_rate', unit: 'rps', baseline: 85, post: 85, noise: 'none' },
    ]);
  });

  it('leaves the unit off a series whose declaration has none', () => {
    expect(backgroundSeries([], [{ service: 'cart', metric: 'request_rate', value: 190 }])).toEqual([
      { service: 'cart', metric: 'request_rate', baseline: 190, post: 190, noise: 'none' },
    ]);
  });

  it('yields to a case that declares the same service and metric', () => {
    // A case whose fault *is* a request-rate collapse has to be able to say so, and the background
    // may not flatten it back.
    const own = [{ service: 'cart', metric: 'request_rate', unit: 'rps', baseline: 190, post: 0 }];
    expect(backgroundSeries(own, SERIES).map((one) => one.service)).toEqual(['checkout']);
  });

  it('does not yield on the service alone', () => {
    // One service's quiet request rate says nothing about the metric an incident moved in it: the
    // cart case's latency and the background's request rate are two readings of the same service.
    const own = [{ service: 'cart', metric: 'http_p99_latency_ms', unit: 'ms', baseline: 12, post: 900 }];
    expect(backgroundSeries(own, SERIES).map((one) => one.metric)).toEqual(['request_rate', 'request_rate']);
  });
});

/**
 * The end-to-end half: the corpus guard, on the shipped corpus, with the background removed.
 *
 * This is the finding reproduced rather than described. The rule that refuses an uncontested case
 * cannot be demonstrated on a corpus that has background, so the demonstration is the corpus without
 * it -- and the count of refusals is what "fifteen cases measured nothing" looks like in output.
 */
const ROOT = new URL('../../../', import.meta.url).pathname;
const CASES = join(ROOT, 'golden-master', 'fault-cases');
/**
 * How many cases the corpus holds, read rather than remembered.
 *
 * The two counts below were literals until the sixteenth case landed, and both went red for the
 * reason finding 271 recorded: an assertion that restates the corpus reports a change in the corpus
 * as a defect in the guard.
 */
const CASE_COUNT = (JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: unknown[] }).cases.length;
const made: string[] = [];

function copyCorpus(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rca-background-'));
  made.push(dir);
  cpSync(CASES, dir, { recursive: true });
  return dir;
}

function run(dir: string): { status: number | null; out: string } {
  const result = spawnSync('node', [join(ROOT, 'scripts', 'check-fault-cases.mjs'), '--cases', dir], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('the corpus guard, with and without the background', () => {
  it('accepts the shipped corpus', () => {
    const result = run(copyCorpus());
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain(`localisation over ${String(CASE_COUNT)} case(s) at top-3, rankings`);
    // The width has to be a real constraint: more candidates than the K the cases are scored at.
    const width = /rankings (\d+)-(\d+) candidate\(s\) wide/.exec(result.out);
    expect(width, result.out).not.toBeNull();
    expect(Number((width as RegExpExecArray)[1]), 'the narrowest ranking must exceed the K').toBeGreaterThan(3);
  });

  it('refuses every case when the background is removed', () => {
    // The finding, as a measurement: without it the rankings hold one to three services, and a
    // ranking no wider than the K it is scored at cannot be missed. Fifteen refusals, one per case,
    // and the report says why before it says which.
    const dir = copyCorpus();
    rmSync(join(dir, 'background-telemetry.json'));
    const result = run(dir);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares no background-telemetry.json');
    const refusals = result.out.match(/so being within the top-K is not a constraint/g) ?? [];
    expect(refusals).toHaveLength(CASE_COUNT);
  });

  it('refuses a background that omits one service', () => {
    const dir = copyCorpus();
    const path = join(dir, 'background-telemetry.json');
    const declaration = JSON.parse(readFileSync(path, 'utf8')) as { series: Array<{ service: string }> };
    declaration.series = declaration.series.filter((one) => one.service !== 'cart-service');
    writeFileSync(path, `${JSON.stringify(declaration, null, 2)}\n`);
    const result = run(dir);
    expect(result.status).toBe(2);
    expect(result.out).toContain("omits the service 'cart-service'");
  });

  it('refuses a checkpoint that cites a background series', () => {
    // The rule that keeps the background from becoming evidence. `request_rate` exists in every
    // case's telemetry and in none of their declarations, so a checkpoint naming it fails as
    // undeclared -- which is the stronger of the two available messages, because the series is
    // there in the data and a reader has to be told why it cannot be cited anyway.
    const dir = copyCorpus();
    const casePath = join(dir, 'history-cart-network-delay.json');
    const faultCase = JSON.parse(readFileSync(casePath, 'utf8')) as {
      groundTruth: { evidenceCheckpoints: Array<Record<string, unknown>> };
    };
    faultCase.groundTruth.evidenceCheckpoints.push({
      checkpointId: 'cp-background',
      entityRef: 'service:synthetic-storefront/cart-service',
      signalRef: 'request_rate',
      comparator: '>=',
      value: 190,
      unit: 'rps',
      description: 'the background request rate, which asserts nothing about this incident',
    });
    writeFileSync(casePath, `${JSON.stringify(faultCase, null, 2)}\n`);
    const result = run(dir);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-background' names 'request_rate', which the signals file does not declare");
  });
});
