import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.js';

/**
 * `rca-bench ingest` runner tests.
 *
 * The command is exercised end-to-end against a real temporary directory: the
 * dataset and the case descriptor are real files on disk, and the bundle is read
 * back from the path the command wrote. The only injection is the working
 * directory and the output sinks, so the filesystem is never faked.
 */

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'rca-bench-ingest-'));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs.length = 0;
});

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

async function readdirRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await readdirRecursive(full)));
    else out.push(full);
  }
  return out;
}

const METRICS_CSV = [
  'timestamp,service,metric_name,value',
  '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41',
  '2025-03-01T00:10:00.000Z,ts-order-service,cpu_usage,0.93',
].join('\n') + '\n';

const LOGS_CSV = [
  'timestamp,service,level,message',
  '2025-03-01T00:10:05.000Z,ts-order-service,ERROR,connection refused',
].join('\n') + '\n';

const CASES = JSON.stringify([
  {
    caseId: 'RE2-ts-order-service-cpu_1',
    component: 'ts-order-service',
    faultType: 'cpu',
    injectTime: '2025-03-01T00:10:00.000Z',
  },
]);

async function seedDataset(dir: string): Promise<void> {
  await writeFiles(dir, {
    'data/metrics/metrics.csv': METRICS_CSV,
    'data/logs/logs.csv': LOGS_CSV,
    'cases.json': CASES,
  });
}

describe('run - ingest', () => {
  it('ingests a prime dataset slice into a bundle file', async () => {
    const dir = await makeDir();
    await seedDataset(dir);

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--system', 'tt', '--output', 'bundle.json'],
      { cwd: dir },
    );

    expect(code).toBe(0);
    const bundle = JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8'));
    expect(bundle.cases[0].caseId).toBe('RE2-ts-order-service-cpu_1');
    expect(bundle.cases[0].groundTruth.rootCauseEntityId).toBe('service:tt/ts-order-service');
    expect(bundle.signals['RE2-ts-order-service-cpu_1']).toHaveLength(3);
  });

  it('prints the bundle to stdout when no output path is given', async () => {
    const dir = await makeDir();
    await seedDataset(dir);
    const out: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json'],
      { cwd: dir, stdout: (s) => out.push(s) },
    );

    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).cases).toHaveLength(1);
  });

  it('names the target as the entity namespace when no system is given', async () => {
    const dir = await makeDir();
    await seedDataset(dir);
    await run(['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--output', 'b.json'], { cwd: dir });

    const bundle = JSON.parse(await readFile(join(dir, 'b.json'), 'utf8'));
    expect(bundle.cases[0].environment.system).toBe('rcaeval');
  });

  it('warns about files that matched no case without failing', async () => {
    const dir = await makeDir();
    await writeFiles(dir, {
      'data/case-a/metrics/metrics.csv': METRICS_CSV,
      'data/stray/metrics/metrics.csv': METRICS_CSV,
      'cases.json': JSON.stringify([
        {
          caseId: 'RE2-ts-order-service-cpu_1',
          component: 'ts-order-service',
          faultType: 'cpu',
          injectTime: '2025-03-01T00:10:00.000Z',
          pathPrefixes: ['case-a/'],
        },
      ]),
    });
    const err: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--output', 'b.json'],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    // The case is selective, so `stray/` is claimed by nobody. The bundle is
    // still produced, but the file must be named rather than quietly dropped.
    expect(code).toBe(0);
    expect(err.join('')).toMatch(/stray\/metrics\/metrics\.csv/);
  });

  it('warns about a case that could not be read', async () => {
    const dir = await makeDir();
    await writeFiles(dir, {
      'data/case-a/metrics/metrics.csv': METRICS_CSV,
      'data/case-b/metrics/metrics.csv': METRICS_CSV,
      'cases.json': JSON.stringify([
        {
          caseId: 'first',
          component: 'ts-order-service',
          faultType: 'cpu',
          injectTime: '2025-03-01T00:10:00.000Z',
          pathPrefixes: ['case-a/'],
        },
        {
          caseId: 'never-read',
          component: 'ts-order-service',
          faultType: 'cpu',
          injectTime: '2025-03-01T00:10:00.000Z',
          pathPrefixes: ['nothing-matches-this/'],
        },
      ]),
    });
    const err: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--output', 'b.json'],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(0);
    expect(err.join('')).toMatch(/never-read.*no files/);
  });

  it('fails when the root cause is absent from the telemetry', async () => {
    const dir = await makeDir();
    await writeFiles(dir, {
      'data/metrics/metrics.csv': METRICS_CSV,
      'cases.json': JSON.stringify([{ caseId: 'c1', component: 'ts-payment-service', faultType: 'cpu', injectTime: '2025-03-01T00:10:00.000Z' }]),
    });
    const err: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json'],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    expect(err.join('')).toMatch(/ts-payment-service/);
  });

  it('rejects a cases file that is not a JSON array', async () => {
    const dir = await makeDir();
    await writeFiles(dir, { 'data/metrics/metrics.csv': METRICS_CSV, 'cases.json': '{"caseId":"c1"}' });
    const err: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json'],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    expect(err.join('')).toMatch(/JSON array/i);
  });

  it('round-trips the ingested bundle through export and the official scorer', async () => {
    const dir = await makeDir();
    await seedDataset(dir);

    const ingest = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--system', 'tt', '--output', 'bundle.json'],
      { cwd: dir },
    );
    expect(ingest).toBe(0);

    const exported = await run(
      ['export', '--target', 'rcaeval', '--suite', 'RE2', '--input', 'bundle.json', '--out-dir', 'out'],
      { cwd: dir },
    );
    expect(exported).toBe(0);
    const files = await readdirRecursive(join(dir, 'out'));
    expect(files.some((p) => p.endsWith('inject_time.txt'))).toBe(true);
    expect(files.some((p) => p.endsWith('metrics.json'))).toBe(true);

    // The official evaluator is pointed straight at our export: the round trip
    // is only real if the exported answer key is scorable by the official rule.
    const out: string[] = [];
    const official = await run(['official', '--target', 'rcaeval-re2', '--dir', 'out'], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(official).toBe(0);
    const report = JSON.parse(out.join(''));
    expect(report.passed).toBe(true);
    expect(report.reports[0].oraclePerfect).toBe(true);
    expect(report.reports[0].mutationsDegrade).toBe(true);
  });

  it('is advertised in the help text', async () => {
    const out: string[] = [];
    await run(['help'], { stdout: (s) => out.push(s) });
    expect(out.join('')).toContain('ingest');
  });

  it('fails when the telemetry never mentions the root-cause service', async () => {
    // A component that failed before the window opened leaves no trace in
    // `service.name`, so no entity can be inferred for it. The run must stop
    // rather than emit a bundle whose root cause points at nothing.
    const dir = await makeDir();
    await writeFiles(dir, {
      'data/metrics/metrics.csv': METRICS_CSV,
      'cases.json': JSON.stringify([
        {
          caseId: 'RE2-absent-cpu_1',
          component: 'ts-absent-service',
          faultType: 'cpu',
          injectTime: '2025-03-01T00:10:00.000Z',
        },
      ]),
    });
    const err: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--output', 'b.json'],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    // The remedy has to name an affordance that exists. This is the message
    // that used to point at `extraEntities` alone, which no flag exposed.
    expect(err.join('')).toMatch(/--entities/);
  });

  it('rescues that ingest when --entities declares the missing service', async () => {
    // The defect this closes: the failure above told the operator to declare
    // the component, but the CLI offered no way to do it. With `--entities`
    // the same dataset now produces a bundle, and that bundle must still be a
    // valid input for the rest of the pipeline -- a rescue that only satisfies
    // the resolver would be worthless.
    const dir = await makeDir();
    await writeFiles(dir, {
      'data/metrics/metrics.csv': METRICS_CSV,
      'cases.json': JSON.stringify([
        {
          caseId: 'RE2-absent-cpu_1',
          component: 'ts-absent-service',
          faultType: 'cpu',
          injectTime: '2025-03-01T00:10:00.000Z',
        },
      ]),
    });
    const entities = JSON.stringify([
      { entityId: 'service:rcaeval/ts-absent-service', kind: 'service', name: 'ts-absent-service', aliases: [] },
    ]);

    const ingest = await run(
      [
        'ingest',
        '--source',
        'data',
        '--target',
        'rcaeval',
        '--cases',
        'cases.json',
        '--system',
        'rcaeval',
        '--entities',
        entities,
        '--output',
        'bundle.json',
      ],
      { cwd: dir },
    );
    expect(ingest).toBe(0);

    const bundle = JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8'));
    expect(bundle.cases[0].groundTruth.rootCauseEntityId).toBe('service:rcaeval/ts-absent-service');
    // The declared entity is present in the graph, not merely referenced.
    expect(bundle.graph.entities.some((e: { entityId: string }) => e.entityId === 'service:rcaeval/ts-absent-service')).toBe(true);
  });

  it('forward all four ingest options into the produced bundle', async () => {
    // `--lead-ms` / `--lag-ms` / `--edges` each have an observable effect on
    // the bundle, so they are asserted through the output rather than through
    // the parser, which would only prove the flags were accepted.
    const dir = await makeDir();
    await seedDataset(dir);
    // The edge target is declared because ingest now rejects an edge whose
    // endpoint the bundle would not contain. The source needs no declaration:
    // telemetry proves it.
    const entities = JSON.stringify([
      { entityId: 'service:rcaeval/ts-pay-service', kind: 'service', name: 'ts-pay-service', namespace: 'rcaeval', aliases: [] },
    ]);
    const edges = JSON.stringify([
      { from: 'service:rcaeval/ts-order-service', to: 'service:rcaeval/ts-pay-service', relation: 'calls' },
    ]);

    const code = await run(
      [
        'ingest',
        '--source',
        'data',
        '--target',
        'rcaeval',
        '--cases',
        'cases.json',
        '--system',
        'rcaeval',
        '--entities',
        entities,
        '--edges',
        edges,
        '--lead-ms',
        '60000',
        '--lag-ms',
        '120000',
        '--output',
        'bundle.json',
      ],
      { cwd: dir },
    );
    expect(code).toBe(0);

    const bundle = JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8'));
    // A 60s lead and 120s lag around a 00:10:00 injection.
    expect(bundle.cases[0].window.start).toBe('2025-03-01T00:09:00.000Z');
    expect(bundle.cases[0].window.end).toBe('2025-03-01T00:12:00.000Z');
    expect(bundle.graph.edges).toContainEqual({
      from: 'service:rcaeval/ts-order-service',
      to: 'service:rcaeval/ts-pay-service',
      relation: 'calls',
    });
  });

  it('rejects a malformed --entities JSON before touching the filesystem', async () => {
    const dir = await makeDir();
    await seedDataset(dir);
    const err: string[] = [];

    const code = await run(
      ['ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json', '--entities', '{'],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    expect(err.join('')).toMatch(/invalid --entities/);
  });

  it('rejects an edge pointing at an entity the graph does not contain', async () => {
    // The command used to exit 0 and write a bundle whose edge referenced a
    // non-existent entity; the error only appeared later at `gate`. A user
    // piping ingest straight into export shipped the inconsistency.
    const dir = await makeDir();
    await seedDataset(dir);
    const err: string[] = [];
    const edges = JSON.stringify([
      { from: 'service:tt/ts-order-service', to: 'service:tt/ghost', relation: 'calls' },
    ]);

    const code = await run(
      [
        'ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json',
        '--system', 'tt', '--edges', edges, '--output', 'b.json',
      ],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    expect(err.join('')).toMatch(/service:tt\/ghost/);
    // The bundle must not have been written at all.
    await expect(readFile(join(dir, 'b.json'), 'utf8')).rejects.toThrow();
  });

  it('rejects a declared entity with a blank name', async () => {
    const dir = await makeDir();
    await seedDataset(dir);
    const err: string[] = [];
    const entities = JSON.stringify([{ entityId: 'service:tt/blank', kind: 'service', name: '   ', aliases: [] }]);

    const code = await run(
      [
        'ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json',
        '--system', 'tt', '--entities', entities, '--output', 'b.json',
      ],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    expect(err.join('')).toMatch(/non-blank name/i);
  });

  it('rejects a blank edge endpoint with a message that says blank', async () => {
    const dir = await makeDir();
    await seedDataset(dir);
    const err: string[] = [];
    const edges = JSON.stringify([{ from: '   ', to: 'service:tt/ts-order-service', relation: 'calls' }]);

    const code = await run(
      [
        'ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json',
        '--system', 'tt', '--edges', edges, '--output', 'b.json',
      ],
      { cwd: dir, stderr: (s) => err.push(s) },
    );

    expect(code).toBe(1);
    expect(err.join('')).toMatch(/non-blank/i);
    // Not misreported as a reference to something that merely is absent.
    expect(err.join('')).not.toMatch(/which is not an entity/);
  });

  it('carries a valid declaration through ingest, gate and export', async () => {
    // The positive control for the tightening above: a graph the caller
    // declares consistently must still travel the whole pipeline. Without this,
    // "reject bad input" would be satisfiable by rejecting everything.
    const dir = await makeDir();
    await seedDataset(dir);
    const entities = JSON.stringify([
      { entityId: 'service:tt/ts-pay-service', kind: 'service', name: 'ts-pay-service', namespace: 'tt', aliases: [] },
    ]);
    const edges = JSON.stringify([
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-pay-service', relation: 'calls' },
    ]);

    const ingest = await run(
      [
        'ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json',
        '--system', 'tt', '--entities', entities, '--edges', edges, '--output', 'bundle.json',
      ],
      { cwd: dir },
    );
    expect(ingest).toBe(0);

    const bundle = JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8'));
    expect(bundle.graph.edges).toEqual([
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-pay-service', relation: 'calls' },
    ]);

    const gate = await run(['gate', '--input', 'bundle.json', '--target', 'rcaeval-re2'], { cwd: dir });
    expect(gate).toBe(0);

    const exported = await run(
      ['export', '--target', 'rcaeval', '--suite', 'RE2', '--input', 'bundle.json', '--out-dir', 'out'],
      { cwd: dir },
    );
    expect(exported).toBe(0);
    expect((await readdirRecursive(join(dir, 'out'))).some((p) => p.endsWith('inject_time.txt'))).toBe(true);
  });

  it('accepts an edge whose endpoints only telemetry proves', async () => {
    // An edge may point at a service that appears in `service.name` without
    // anyone declaring it. Rejecting that would be over-tightening, so the
    // check consults the finished graph rather than the declared subset.
    const dir = await makeDir();
    await writeFiles(dir, {
      'data/metrics/metrics.csv': METRICS_CSV,
      'data/logs/logs.csv': LOGS_CSV.replace(/ts-order-service/g, 'ts-pay-service'),
      'cases.json': CASES,
    });
    const edges = JSON.stringify([
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-pay-service', relation: 'calls' },
    ]);

    const code = await run(
      [
        'ingest', '--source', 'data', '--target', 'rcaeval', '--cases', 'cases.json',
        '--system', 'tt', '--edges', edges, '--output', 'bundle.json',
      ],
      { cwd: dir },
    );

    expect(code).toBe(0);
    const bundle = JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8'));
    expect(bundle.graph.edges).toHaveLength(1);
  });
});
