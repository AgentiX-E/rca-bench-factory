import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function minimalDraft(): Record<string, unknown> {
  return {
    graph: {
      entities: [
        { entityId: 'service:default/order', kind: 'service', name: 'order', namespace: 'default', aliases: [] },
      ],
      edges: [],
    },
    case: {
      caseId: 'case-001',
      system: 'order-prod',
      injectTime: '2026-09-06T00:10:00.000Z',
      window: { start: '2026-09-06T00:00:00.000Z', end: '2026-09-06T00:20:00.000Z' },
      fault: { type: 'cpu' },
      groundTruth: {
        rootCauseEntityId: 'service:default/order',
        rootCauseComponent: 'order',
        rootCauseReason: 'CPU saturation on the order service',
      },
    },
    signals: [
      {
        irVersion: '2.0',
        resource: { 'service.name': 'order' },
        timestamp: '2026-09-06T00:10:00.000Z',
        signal: 'metric',
        payload: { kind: 'metric', name: 'cpu_usage', value: 95, unit: '%' },
      },
    ],
  };
}

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

  it('exports a bundle to AIOps2025', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'aiops2025', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const gt = await readFile(join(dir, 'out', 'groundtruth.jsonl'), 'utf8');
    expect(JSON.parse(gt.trim()).fault_type).toBe('cpu');
  });

  it('exports a bundle to Cloud-OpsBench', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'cloud-opsbench', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const meta = await readFile(join(dir, 'out', 'cases', 'case-001', 'metadata.json'), 'utf8');
    expect(JSON.parse(meta).result.fault_object).toBe('order');
  });

  it('exports a bundle to OpenRCA 2.0', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'openrca-2.0', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const path = await readFile(join(dir, 'out', 'cases', 'case-001', 'causal_path.json'), 'utf8');
    expect(JSON.parse(path).case_id).toBe('case-001');
  });

  it('exports a bundle to ITBench', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['export', '--target', 'itbench', '--input', 'bundle.json', '--out-dir', 'out'], { cwd: dir });
    expect(code).toBe(0);
    const scenario = await readFile(join(dir, 'out', 'scenarios', 'case-001', 'scenario.json'), 'utf8');
    expect(JSON.parse(scenario).scenario_domain).toBe('SRE');
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

describe('run - transform', () => {
  it('applies transform rules and reports the result counts', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'src.json'), JSON.stringify([{ status: 'ok' }, { status: 'err' }]));
    await writeFile(join(dir, 'rules.json'), JSON.stringify([{ id: 'r1', kind: 'map', from: 'status', to: 'status_norm', mapping: { ok: 'OK', err: 'ERROR' } }]));
    const out: string[] = [];
    const code = await run(['transform', '--input', 'src.json', '--rules', 'rules.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(result.counts).toEqual({ input: 2, output: 2, quarantine: 0 });
    expect(result.outputs[0].record.status_norm).toBe('OK');
  });

  it('quarantines a record with an unmapped value', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'src.json'), JSON.stringify([{ status: 'unknown' }]));
    await writeFile(join(dir, 'rules.json'), JSON.stringify([{ id: 'r1', kind: 'map', from: 'status', to: 'status_norm', mapping: { ok: 'OK' } }]));
    const out: string[] = [];
    const code = await run(['transform', '--input', 'src.json', '--rules', 'rules.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).counts.quarantine).toBe(1);
  });

  it('writes to --output and honours --id-field', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'src.json'), JSON.stringify([{ id: 'a', status: 'ok' }]));
    await writeFile(join(dir, 'rules.json'), JSON.stringify([{ id: 'r1', kind: 'map', from: 'status', to: 'status_norm', mapping: { ok: 'OK' } }]));
    const code = await run(['transform', '--input', 'src.json', '--rules', 'rules.json', '--id-field', 'id', '--output', 'out.json'], { cwd: dir });
    expect(code).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'out.json'), 'utf8')).outputs[0].recordId).toBe('a');
  });

  it('rejects a non-array --input and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'src.json'), '{}');
    await writeFile(join(dir, 'rules.json'), '[]');
    const err: string[] = [];
    const code = await run(['transform', '--input', 'src.json', '--rules', 'rules.json'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('array');
  });

  it('rejects a non-array --rules and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'src.json'), '[]');
    await writeFile(join(dir, 'rules.json'), '{}');
    const err: string[] = [];
    const code = await run(['transform', '--input', 'src.json', '--rules', 'rules.json'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('array');
  });
});

describe('run - gate', () => {
  it('runs all five gates and reports the injected gate-run-id', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const out: string[] = [];
    const code = await run(['gate', '--input', 'bundle.json', '--target', 'rcaeval-re1', '--gate-run-id', 'run-1'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const report = JSON.parse(out.join(''));
    expect(report.results).toHaveLength(5);
    expect(report.gateRunId).toBe('run-1');
    expect(['admitted', 'quarantined', 'rejected']).toContain(report.finalStatus);
  });

  it('derives G1 required signals from the rca100 target', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const out: string[] = [];
    const code = await run(['gate', '--input', 'bundle.json', '--target', 'rca100'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const report = JSON.parse(out.join(''));
    const g1 = report.results.find((r: { gateId: string }) => r.gateId === 'G1');
    expect(g1.violations.some((v: { code: string }) => v.code === 'MISSING_SIGNAL')).toBe(true);
  });

  it('enforces the query requirement for the openrca-1.0 target', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const out: string[] = [];
    const code = await run(['gate', '--input', 'bundle.json', '--target', 'openrca-1.0'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const report = JSON.parse(out.join(''));
    const g1 = report.results.find((r: { gateId: string }) => r.gateId === 'G1');
    // The minimal bundle carries a query, so the query requirement does not fire;
    // the metric+trace requirement still does (it has no trace signal).
    expect(g1.violations.some((v: { code: string }) => v.code === 'MISSING_QUERY')).toBe(false);
  });

  it('generates a timestamped gate-run-id when none is given', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const out: string[] = [];
    const code = await run(['gate', '--input', 'bundle.json', '--target', 'rca100'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).gateRunId).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reports a schema-invalid bundle and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), '{}');
    const err: string[] = [];
    const code = await run(['gate', '--input', 'bundle.json', '--target', 'rca100'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });
});

describe('run - case', () => {
  it('assembles a draft into a bundle with a normalised fault', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), JSON.stringify(minimalDraft()));
    const out: string[] = [];
    const code = await run(['case', '--input', 'draft.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const bundle = JSON.parse(out.join(''));
    expect(bundle.cases[0].fault).toMatchObject({ type: 'cpu', category: 'resource' });
    expect(bundle.signals['case-001']).toHaveLength(1);
  });

  it('writes the bundle to --output', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), JSON.stringify(minimalDraft()));
    const code = await run(['case', '--input', 'draft.json', '--output', 'bundle.json'], { cwd: dir });
    expect(code).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8')).cases[0].caseId).toBe('case-001');
  });

  it('rejects an invalid draft and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), JSON.stringify({ case: { fault: {} }, graph: {}, signals: [] }));
    const err: string[] = [];
    const code = await run(['case', '--input', 'draft.json'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });

  it('reports malformed draft JSON and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), 'not json');
    const err: string[] = [];
    const code = await run(['case', '--input', 'draft.json'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });
});

describe('evolve', () => {
  const rule = (id: string): Record<string, unknown> => ({
    id,
    kind: 'map',
    from: 'status',
    to: 'status_norm',
    mapping: { ok: 'OK' },
  });

  const draft = (): string =>
    JSON.stringify({
      id: 'prop-1',
      layer: 'L1',
      action: 'rule-evolution',
      trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
      changes: [{ ruleId: 'r1', kind: 'update', before: rule('r1'), after: rule('r1') }],
      baselineScore: 80,
      candidateScore: 90,
      baseVersion: 'abc1234',
    });

  const pendingProposal = (): string =>
    JSON.stringify({
      id: 'prop-1',
      layer: 'L1',
      hitlGate: 'H4',
      trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
      changes: [{ ruleId: 'r1', kind: 'update', before: rule('r1'), after: rule('r1') }],
      regression: { baselineScore: 80, candidateScore: 90, passed: true },
      baseVersion: 'abc1234',
      status: 'pending',
    });

  it('proposes a pending proposal from a draft', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), draft());
    const out: string[] = [];
    const code = await run(['evolve', 'propose', '--input', 'draft.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const proposal = JSON.parse(out.join(''));
    expect(proposal.hitlGate).toBe('H4');
    expect(proposal.status).toBe('pending');
    expect(proposal.regression.passed).toBe(true);
  });

  it('writes the proposed proposal to --output', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), draft());
    const code = await run(['evolve', 'propose', '--input', 'draft.json', '--output', 'proposal.json'], { cwd: dir });
    expect(code).toBe(0);
    const proposal = JSON.parse(await readFile(join(dir, 'proposal.json'), 'utf8'));
    expect(proposal.status).toBe('pending');
  });

  it('approves a pending proposal to stdout', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'proposal.json'), pendingProposal());
    const out: string[] = [];
    const code = await run(['evolve', 'approve', '--input', 'proposal.json', '--note', 'ship it'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const approved = JSON.parse(out.join(''));
    expect(approved.status).toBe('approved');
    expect(approved.note).toBe('ship it');
  });

  it('approves a proposal and writes it to --output', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'proposal.json'), pendingProposal());
    const code = await run(['evolve', 'approve', '--input', 'proposal.json', '--output', 'approved.json'], { cwd: dir });
    expect(code).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'approved.json'), 'utf8')).status).toBe('approved');
  });

  it('rejects a proposal to stdout', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'proposal.json'), pendingProposal());
    const out: string[] = [];
    const code = await run(['evolve', 'reject', '--input', 'proposal.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).status).toBe('rejected');
  });

  it('rejects a proposal and writes it to --output', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'proposal.json'), pendingProposal());
    const code = await run(['evolve', 'reject', '--input', 'proposal.json', '--output', 'rejected.json'], { cwd: dir });
    expect(code).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'rejected.json'), 'utf8')).status).toBe('rejected');
  });

  it('computes stale cases for a failed proposal', async () => {
    const dir = await makeDir();
    const failed = JSON.stringify({
      id: 'prop-1',
      layer: 'L1',
      hitlGate: 'H4',
      trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
      changes: [{ ruleId: 'r1', kind: 'update', before: rule('r1'), after: rule('r1') }],
      regression: { baselineScore: 80, candidateScore: 70, passed: false },
      baseVersion: 'abc1234',
      status: 'pending',
    });
    await writeFile(join(dir, 'proposal.json'), failed);
    const out: string[] = [];
    const code = await run(['evolve', 'stale', '--input', 'proposal.json', '--cases', '["case-001","case-002"]'], {
      cwd: dir,
      stdout: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join(''))).toEqual(['case-001', 'case-002']);
  });

  it('computes no stale cases for an approved passing proposal', async () => {
    const dir = await makeDir();
    const ok = JSON.stringify({
      id: 'prop-1',
      layer: 'L1',
      hitlGate: 'H4',
      trigger: { source: 'gate' },
      changes: [{ ruleId: 'r1', kind: 'add', after: rule('r1') }],
      regression: { baselineScore: 80, candidateScore: 90, passed: true },
      baseVersion: 'abc1234',
      status: 'approved',
    });
    await writeFile(join(dir, 'proposal.json'), ok);
    const out: string[] = [];
    const code = await run(['evolve', 'stale', '--input', 'proposal.json', '--cases', '["case-001"]'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join(''))).toEqual([]);
  });

  it('reports a parse error and returns 1 for a malformed draft', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'draft.json'), 'not json');
    const err: string[] = [];
    const code = await run(['evolve', 'propose', '--input', 'draft.json'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });

  it('returns 1 for a non-array --cases value', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'proposal.json'), pendingProposal());
    const err: string[] = [];
    // '{}' is valid JSON but not an array, so the runner rejects it.
    const code = await run(['evolve', 'stale', '--input', 'proposal.json', '--cases', '{}'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('array');
  });
});

describe('official', () => {
  /** The repository root, so the shipped example bundle can be read as a real input. */
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

  /**
   * The shipped example, plus a second case whose fault category is `code`.
   *
   * RCAEval's RE3 suite admits code-level faults only, so a bundle carrying
   * nothing but the example's CPU-saturation case cannot exercise it. Cloning
   * the case with a different category is the smallest change that makes all
   * nine targets runnable, and it is how a real benchmark is built.
   */
  async function exampleBundleWithCodeCase(): Promise<IrBundle> {
    const shipped = JSON.parse(await readFile(join(repoRoot, 'examples', 'order-prod', 'bundle.json'), 'utf8')) as IrBundle;
    const source = shipped.cases[0]!;
    const codeCase = { ...source, caseId: 'case-002', fault: { ...source.fault, category: 'code' } };
    return {
      ...shipped,
      cases: [source, codeCase],
      signals: { ...shipped.signals, 'case-002': shipped.signals['case-001'] ?? [] },
    };
  }

  it('runs the oracle and mutation grid against an exported directory', async () => {
    const dir = await makeDir();
    await writeExported(join(dir, 'exported'), exportOpenRca(minimalBundle()).files);
    const out: string[] = [];
    const code = await run(['official', '--target', 'openrca-1.0', '--dir', 'exported'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);

    const payload = JSON.parse(out.join(''));
    expect(payload.passed).toBe(true);
    expect(payload.counts).toEqual({ passed: 1, skipped: 0, failed: 0 });
    expect(payload.reports).toHaveLength(1);
    expect(payload.reports[0].target).toBe('openrca-1.0');
    expect(payload.reports[0].oraclePerfect).toBe(true);
    expect(payload.reports[0].mutationsDegrade).toBe(true);
    expect(payload.reports[0].unscoredFacetsInert).toBe(true);
  });

  it('returns 1 when the exported directory yields no cases', async () => {
    const dir = await makeDir();
    const out: string[] = [];
    const code = await run(['official', '--target', 'rca100', '--dir', '.'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(1);
    const payload = JSON.parse(out.join(''));
    expect(payload.passed).toBe(false);
    expect(payload.reports[0].failures.join(' ')).toMatch(/no cases were exported/);
  });

  it('skips an empty export only when the reason is stated', async () => {
    const dir = await makeDir();
    const out: string[] = [];
    const code = await run(
      ['official', '--target', 'rcaeval-re3', '--dir', '.', '--allow-empty-reason', 'RE3 admits code-level faults only'],
      { cwd: dir, stdout: (s) => out.push(s) },
    );
    expect(code).toBe(0);
    const payload = JSON.parse(out.join(''));
    expect(payload.reports[0].status).toBe('skipped');
    expect(payload.reports[0].skipReason).toBe('RE3 admits code-level faults only');
    expect(payload.counts).toEqual({ passed: 0, skipped: 1, failed: 0 });
  });

  it('runs all nine targets from a bundle and passes', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(await exampleBundleWithCodeCase()));
    const out: string[] = [];
    const code = await run(['official', '--input', 'bundle.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);

    const payload = JSON.parse(out.join(''));
    expect(payload.counts).toEqual({ passed: 9, skipped: 0, failed: 0 });
    expect(payload.reports.map((r: { target: string }) => r.target)).toEqual([
      'openrca-1.0',
      'openrca-2.0',
      'rcaeval-re1',
      'rcaeval-re2',
      'rcaeval-re3',
      'rca100',
      'aiops2025',
      'cloud-opsbench',
      'itbench',
    ]);
    for (const report of payload.reports) {
      expect(report.status).toBe('passed');
      expect(report.oraclePerfect).toBe(true);
      expect(report.mutationsDegrade).toBe(true);
    }
  });

  it('fails the bundle run when RE3 has no code-level case to export', async () => {
    const dir = await makeDir();
    const shipped = await readFile(join(repoRoot, 'examples', 'order-prod', 'bundle.json'), 'utf8');
    await writeFile(join(dir, 'bundle.json'), shipped);
    const out: string[] = [];
    const code = await run(['official', '--input', 'bundle.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(1);

    const payload = JSON.parse(out.join(''));
    const re3 = payload.reports.find((r: { target: string }) => r.target === 'rcaeval-re3');
    expect(re3.status).toBe('failed');
    expect(re3.caseCount).toBe(0);
  });

  it('writes the regression report to --output', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(await exampleBundleWithCodeCase()));
    const code = await run(['official', '--input', 'bundle.json', '--output', 'official.json'], { cwd: dir });
    expect(code).toBe(0);
    const payload = JSON.parse(await readFile(join(dir, 'official.json'), 'utf8'));
    expect(payload.passed).toBe(true);
    expect(payload.reports).toHaveLength(9);
  });
});

describe('report', () => {
  it('renders an HTML report to stdout', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const out: string[] = [];
    const code = await run(['report', '--input', 'bundle.json'], { cwd: dir, stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    const html = out.join('');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Observability coverage');
    expect(html).toContain('Entity graph');
    expect(html).toContain('Quality gates');
    expect(html).toContain('<h2>Score</h2>');
  });

  it.each(['openrca-2.0', 'rcaeval-re1', 'rcaeval-re2', 'rcaeval-re3', 'rca100', 'aiops2025', 'cloud-opsbench', 'itbench'] as const)(
    'renders a report for target %s',
    async (target) => {
      const dir = await makeDir();
      await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
      const out: string[] = [];
      const code = await run(['report', '--input', 'bundle.json', '--target', target], { cwd: dir, stdout: (s) => out.push(s) });
      expect(code).toBe(0);
      expect(out.join('')).toContain(`target <b>${target}</b>`);
    },
  );

  it('writes the report to --output with a title and target', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), JSON.stringify(minimalBundle()));
    const code = await run(['report', '--input', 'bundle.json', '--title', 'My Report', '--target', 'cloud-opsbench', '--output', 'r.html'], { cwd: dir });
    expect(code).toBe(0);
    const html = await readFile(join(dir, 'r.html'), 'utf8');
    expect(html).toContain('<title>My Report</title>');
    expect(html).toContain('target <b>cloud-opsbench</b>');
  });

  it('reports a schema-invalid bundle and returns 1', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'bundle.json'), '{}');
    const err: string[] = [];
    const code = await run(['report', '--input', 'bundle.json'], { cwd: dir, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join('')).toContain('error');
  });
});
