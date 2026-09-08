import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import { exportOpenRca } from '@rca-bench-factory/core';
import type { IrBundle } from '@rca-bench-factory/core';

/**
 * `rca-bench` runner tests.
 *
 * The runner is exercised end-to-end against a real temporary directory: real
 * files are written and read back, the exported artefacts are real exporter
 * output, and stdout/stderr are captured through the injected sinks. No mocking
 * library is used; the only injection is the working directory and the two
 * output sinks, which keeps the suite hermetic without faking the filesystem.
 */

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'rca-bench-cli-'));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs.length = 0;
});

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function minimalBundle(): IrBundle {
  return {
    irVersion: '2.0',
    graph: {
      entities: [
        { entityId: 'service:default/order', kind: 'service', name: 'order', namespace: 'default', aliases: [] },
      ],
      edges: [],
    },
    cases: [
      {
        caseId: 'case-001',
        system: 'order-prod',
        environment: { system: 'order-prod', version: 'v1.2.3' },
        injectTime: '2026-09-06T00:10:00.000Z',
        window: { start: '2026-09-06T00:00:00.000Z', end: '2026-09-06T00:20:00.000Z' },
        fault: { type: 'cpu', category: 'resource', injectionMethod: 'chaos-mesh' },
        groundTruth: {
          rootCauseEntityId: 'service:default/order',
          rootCauseComponent: 'order',
          rootCauseReason: 'CPU saturation on the order service',
        },
        query: 'The order service became slow. Find the root cause.',
        difficulty: 'L2',
        answerKeyIsolated: true,
      },
    ],
    signals: {
      'case-001': [
        {
          irVersion: '2.0',
          resource: { 'service.name': 'order' },
          timestamp: '2026-09-06T00:10:00.000Z',
          signal: 'metric',
          payload: { kind: 'metric', name: 'cpu_usage', value: 95, unit: '%' },
        },
      ],
    },
  };
}

const METRIC_CSV =
  'timestamp,cmdb_id,kpi_name,value\n2026-09-06T00:00:00Z,order-pod-1,cpu_usage,20\n2026-09-06T00:10:00Z,order-pod-1,cpu_usage,95\n';

async function writeExported(dir: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
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

describe('run - help, version and errors', () => {
  it('prints help for an empty argv and returns 0', async () => {
    const out: string[] = [];
    const code = await run([], { stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(out.join('')).toContain('rca-bench');
  });

  it('prints the version and returns 0', async () => {
    const out: string[] = [];
    const code = await run(['version'], { stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(out.join('').trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('falls back to the real working directory and sinks when no options are given', async () => {
    expect(await run(['version'])).toBe(0);
  });

  it('writes a parse error to the real stderr when no sink is injected', async () => {
    expect(await run(['frobnicate'])).toBe(1);
  });

  it('reports a parse error and returns 1', async () => {
    const err: string[] = [];
    const code = await run(['frobnicate'], { stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });
});

describe('run - source', () => {
  it('ingests a CSV into signals written to --output', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), METRIC_CSV);
    const code = await run(['source', '--path', 'in.csv', '--signal-kind', 'metric', '--output', 'out.json'], { cwd: dir });
    expect(code).toBe(0);
    const parsed = JSON.parse(await readFile(join(dir, 'out.json'), 'utf8'));
    expect(parsed.signals).toHaveLength(2);
    expect(parsed.quarantine).toEqual([]);
  });

  it('auto-detects the layout when no --layout is given', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), METRIC_CSV);
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.csv', '--signal-kind', 'metric'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.signals).toHaveLength(2);
    expect(parsed.signals[0].payload.name).toBe('cpu_usage');
  });

  it('defaults to CSV and metric signal kind when both are omitted', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), METRIC_CSV);
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.csv'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toHaveLength(2);
  });

  it('passes every source option through to the ingester', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), METRIC_CSV);
    const code = await run(
      [
        'source', '--path', 'in.csv', '--format', 'csv', '--signal-kind', 'metric',
        '--time-layout', 'iso8601', '--assume-offset-minutes', '0', '--delimiter', ',',
        '--has-header', '--service-name', 'order', '--output', 'out.json',
      ],
      { cwd: dir },
    );
    expect(code).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'out.json'), 'utf8')).signals).toHaveLength(2);
  });

  it('handles an empty CSV with zero signals', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), '');
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.csv'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toEqual([]);
  });

  it('uses an explicit --layout when provided', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), METRIC_CSV);
    const out: string[] = [];
    const layout = JSON.stringify({ timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' });
    const code = await run(['source', '--path', 'in.csv', '--signal-kind', 'metric', '--layout', layout], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toHaveLength(2);
  });

  it('auto-detects a JSONL layout', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.jsonl'), '{"timestamp":"2026-09-06T00:00:00Z","service":"order","metric":"cpu_usage","value":20}\n');
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.jsonl', '--format', 'jsonl', '--signal-kind', 'metric'], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toHaveLength(1);
  });

  it('handles an empty JSONL with zero signals', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.jsonl'), '');
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.jsonl', '--format', 'jsonl'], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toEqual([]);
  });

  it('auto-detects a JSON array layout', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.json'), '[{"timestamp":"2026-09-06T00:00:00Z","service":"order","metric":"cpu_usage","value":20}]');
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.json', '--format', 'json', '--signal-kind', 'metric'], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toHaveLength(1);
  });

  it('auto-detects a TSV layout', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.tsv'), 'timestamp\tcmdb_id\tkpi_name\tvalue\n2026-09-06T00:00:00Z\torder-pod-1\tcpu_usage\t20\n');
    const out: string[] = [];
    const code = await run(['source', '--path', 'in.tsv', '--format', 'tsv', '--signal-kind', 'metric'], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).signals).toHaveLength(1);
  });

  it('reports a missing input file and returns 1', async () => {
    const dir = await makeDir();
    const err: string[] = [];
    const code = await run(['source', '--path', 'missing.csv', '--signal-kind', 'metric'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });

  it('rejects a non-object --layout and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'in.csv'), METRIC_CSV);
    const err: string[] = [];
    const code = await run(['source', '--path', 'in.csv', '--signal-kind', 'metric', '--layout', '[]'], {
      cwd: dir,
      stderr: (s) => err.push(s),
    });
    expect(code).toBe(1);
    expect(err.join('')).toContain('object');
  });
});

describe('run - export', () => {
  it('exports a bundle to OpenRCA', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'openrca-1.0', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const query = await readFile(join(dir, 'out', 'order-prod', 'query.csv'), 'utf8');
    expect(query).toContain('instruction_id');
  });

  it('exports a bundle to RCAEval with a default RE2 suite', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'rcaeval', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const files = await readdirRecursive(join(dir, 'out'));
    expect(files.some((p) => p.endsWith('metrics.json'))).toBe(true);
    expect(files.some((p) => p.endsWith('logs.csv'))).toBe(true);
  });

  it('exports a bundle to RCA100', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'rca100', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const topo = await readFile(join(dir, 'out', 'cases', 'case-001', 'topology.json'), 'utf8');
    expect(JSON.parse(topo).entities).toHaveLength(1);
  });

  it('reports malformed bundle JSON and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), 'not json');
    const err: string[] = [];
    const code = await run(['export', '--target', 'openrca-1.0', '--input', 'bundle.json', '--out-dir', 'out'], {
      cwd: dir,
      stderr: (s) => err.push(s),
    });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });

  it('reports a schema-invalid bundle and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify({ irVersion: '2.0' }));
    const err: string[] = [];
    const code = await run(['export', '--target', 'openrca-1.0', '--input', 'bundle.json', '--out-dir', 'out'], {
      cwd: dir,
      stderr: (s) => err.push(s),
    });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });
});

describe('run - score', () => {
  it('scores a valid OpenRCA export as passing and returns 0', async () => {
    const dir = await makeDir();
    const files = exportOpenRca(minimalBundle()).files;
    await writeExported(join(dir, 'exported'), files);
    const out: string[] = [];
    const code = await run(['score', '--target', 'openrca-1.0', '--dir', 'exported'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).passed).toBe(true);
  });

  it('returns 1 for a failing export', async () => {
    const dir = await makeDir();
    const out: string[] = [];
    const code = await run(['score', '--target', 'openrca-1.0', '--dir', '.'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(1);
    expect(JSON.parse(out.join('')).passed).toBe(false);
  });

  it('scores with anchors', async () => {
    const dir = await makeDir();
    const files = exportOpenRca(minimalBundle()).files;
    await writeExported(join(dir, 'exported'), files);
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const out: string[] = [];
    const code = await run(['score', '--target', 'openrca-1.0', '--dir', 'exported', '--anchors', JSON.stringify(anchors)], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).checksum.passed).toBe(true);
  });

  it('rejects a non-object --anchors and returns 1', async () => {
    const dir = await makeDir();
    const err: string[] = [];
    const code = await run(['score', '--target', 'openrca-1.0', '--dir', '.', '--anchors', '[]'], {
      cwd: dir,
      stderr: (s) => err.push(s),
    });
    expect(code).toBe(1);
    expect(err.join('')).toContain('object');
  });
});
