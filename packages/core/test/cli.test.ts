import { describe, expect, it } from 'vitest';
import { formatHelp, formatVersion, parseCliArgs } from '../src/cli/args.js';
import { PRIME_DATASET_IDS } from '../src/ingest/prime.js';

/**
 * CLI argument parser tests.
 *
 * `parseCliArgs` is a pure function of `argv`: same input, same command object
 * or the same error. No IO, no mocks. The suite asserts every command, every
 * option, every enum validation and every error path.
 */

describe('parseCliArgs - help and version', () => {
  it('defaults to help for an empty argv', () => {
    expect(parseCliArgs([])).toEqual({ ok: true, command: { command: 'help' } });
  });

  it('accepts the --help flag', () => {
    expect(parseCliArgs(['--help'])).toEqual({ ok: true, command: { command: 'help' } });
    expect(parseCliArgs(['-h'])).toEqual({ ok: true, command: { command: 'help' } });
  });

  it('accepts the --version flag', () => {
    expect(parseCliArgs(['--version'])).toEqual({ ok: true, command: { command: 'version' } });
    expect(parseCliArgs(['-v'])).toEqual({ ok: true, command: { command: 'version' } });
  });

  it('accepts the help and version subcommands', () => {
    expect(parseCliArgs(['help'])).toEqual({ ok: true, command: { command: 'help' } });
    expect(parseCliArgs(['version'])).toEqual({ ok: true, command: { command: 'version' } });
  });

  it('rejects an unknown command', () => {
    const result = parseCliArgs(['frobnicate']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown command/i);
  });
});

describe('parseCliArgs - source', () => {
  it('parses a minimal source command', () => {
    expect(parseCliArgs(['source', '--path', './telemetry.csv'])).toEqual({
      ok: true,
      command: { command: 'source', path: './telemetry.csv' },
    });
  });

  it('parses an optional --output path', () => {
    expect(parseCliArgs(['source', '--path', './x.csv', '--output', './out.json'])).toEqual({
      ok: true,
      command: { command: 'source', path: './x.csv', output: './out.json' },
    });
  });

  it('parses every source option', () => {
    const result = parseCliArgs([
      'source',
      '--path', './x.csv',
      '--format', 'csv',
      '--signal-kind', 'metric',
      '--layout', '{"timestamp":"ts","metricName":"name","metricValue":"value"}',
      '--service-name', 'order',
      '--time-layout', 'java_log',
      '--assume-offset-minutes', '480',
      '--has-header',
      '--delimiter', ';',
    ]);
    expect(result).toEqual({
      ok: true,
      command: {
        command: 'source',
        path: './x.csv',
        format: 'csv',
        signalKind: 'metric',
        layout: '{"timestamp":"ts","metricName":"name","metricValue":"value"}',
        serviceName: 'order',
        timeLayout: 'java_log',
        assumeOffsetMinutes: 480,
        hasHeader: true,
        delimiter: ';',
      },
    });
  });

  it('requires --path', () => {
    const result = parseCliArgs(['source']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/path/i);
  });

  it('rejects an invalid --format', () => {
    const result = parseCliArgs(['source', '--path', 'x', '--format', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/format/i);
  });

  it('rejects an invalid --signal-kind', () => {
    const result = parseCliArgs(['source', '--path', 'x', '--signal-kind', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/signal-kind/i);
  });

  it('rejects an invalid --time-layout', () => {
    const result = parseCliArgs(['source', '--path', 'x', '--time-layout', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/time-layout/i);
  });

  it('rejects a non-numeric --assume-offset-minutes', () => {
    const result = parseCliArgs(['source', '--path', 'x', '--assume-offset-minutes', 'abc']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/offset/i);
  });

  it('rejects malformed --layout JSON', () => {
    const result = parseCliArgs(['source', '--path', 'x', '--layout', 'not-json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/layout/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['source', '--path', 'x', '--bogus', 'y']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - ingest', () => {
  it('parses a minimal ingest command', () => {
    expect(parseCliArgs(['ingest', '--source', './official-data', '--target', 'rcaeval', '--cases', 'cases.json'])).toEqual({
      ok: true,
      command: { command: 'ingest', source: './official-data', target: 'rcaeval', cases: 'cases.json' },
    });
  });

  it('parses an ingest command with an explicit system and output', () => {
    expect(
      parseCliArgs([
        'ingest',
        '--source', './official-data',
        '--target', 'openrca-1.0',
        '--cases', 'cases.json',
        '--system', 'order-prod',
        '--output', 'bundle.json',
      ]),
    ).toEqual({
      ok: true,
      command: {
        command: 'ingest',
        source: './official-data',
        target: 'openrca-1.0',
        cases: 'cases.json',
        system: 'order-prod',
        output: 'bundle.json',
      },
    });
  });

  it('accepts every prime dataset id', () => {
    for (const target of PRIME_DATASET_IDS) {
      const result = parseCliArgs(['ingest', '--source', './d', '--target', target, '--cases', 'c.json']);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.command).toMatchObject({ target });
    }
  });

  it('requires a source', () => {
    const result = parseCliArgs(['ingest', '--target', 'rcaeval', '--cases', 'c.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--source/);
  });

  it('requires a known target', () => {
    const result = parseCliArgs(['ingest', '--source', './d', '--target', 'nope', '--cases', 'c.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--target/);
  });

  it('requires a cases file', () => {
    const result = parseCliArgs(['ingest', '--source', './d', '--target', 'rcaeval']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--cases/);
  });

  it('rejects a blank system', () => {
    const result = parseCliArgs(['ingest', '--source', './d', '--target', 'rcaeval', '--cases', 'c.json', '--system', '  ']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--system/);
  });

  it('surfaces the flag parser error for an unknown option', () => {
    // `parseFlags` throws before any field validation runs, so this path is
    // distinct from "a required flag is missing". The parser's own wording is
    // relayed verbatim rather than reworded, so the caller can tell which layer
    // rejected the invocation.
    const result = parseCliArgs(['ingest', '--source', './d', '--target', 'rcaeval', '--cases', 'c.json', '--bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--bogus/);
  });

  it('surfaces the flag parser error when a flag is given no value', () => {
    const result = parseCliArgs(['ingest', '--source', './d', '--target', 'rcaeval', '--cases']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--cases/);
  });

  it('surfaces the flag parser error for an unexpected positional', () => {
    const result = parseCliArgs(['ingest', '--source', './d', '--target', 'rcaeval', '--cases', 'c.json', 'stray']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toBe('');
  });
});

describe('parseCliArgs - export', () => {
  it('parses an OpenRCA export command', () => {
    expect(parseCliArgs(['export', '--target', 'openrca-1.0', '--input', 'bundle.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'openrca-1.0', input: 'bundle.json', outDir: './out' },
    });
  });

  it('parses an RCAEval export command with a suite', () => {
    expect(parseCliArgs(['export', '--target', 'rcaeval', '--suite', 're2', '--input', 'b.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'rcaeval', suite: 'RE2', input: 'b.json', outDir: './out' },
    });
  });

  it('parses an RCA100 export command', () => {
    expect(parseCliArgs(['export', '--target', 'rca100', '--input', 'b.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'rca100', input: 'b.json', outDir: './out' },
    });
  });

  it('parses an AIOps2025 export command', () => {
    expect(parseCliArgs(['export', '--target', 'aiops2025', '--input', 'b.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'aiops2025', input: 'b.json', outDir: './out' },
    });
  });

  it('parses a Cloud-OpsBench export command', () => {
    expect(parseCliArgs(['export', '--target', 'cloud-opsbench', '--input', 'b.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'cloud-opsbench', input: 'b.json', outDir: './out' },
    });
  });

  it('parses an OpenRCA 2.0 export command', () => {
    expect(parseCliArgs(['export', '--target', 'openrca-2.0', '--input', 'b.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'openrca-2.0', input: 'b.json', outDir: './out' },
    });
  });

  it('parses an ITBench export command', () => {
    expect(parseCliArgs(['export', '--target', 'itbench', '--input', 'b.json', '--out-dir', './out'])).toEqual({
      ok: true,
      command: { command: 'export', target: 'itbench', input: 'b.json', outDir: './out' },
    });
  });

  it('requires --target', () => {
    const result = parseCliArgs(['export', '--input', 'b.json', '--out-dir', './out']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('requires --input', () => {
    const result = parseCliArgs(['export', '--target', 'openrca-1.0', '--out-dir', './out']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --out-dir', () => {
    const result = parseCliArgs(['export', '--target', 'openrca-1.0', '--input', 'b.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/out-dir/i);
  });

  it('rejects an invalid --target', () => {
    const result = parseCliArgs(['export', '--target', 'bogus', '--input', 'b.json', '--out-dir', './out']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('rejects an invalid --suite', () => {
    const result = parseCliArgs(['export', '--target', 'rcaeval', '--suite', 'bogus', '--input', 'b.json', '--out-dir', './out']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/suite/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['export', '--target', 'openrca-1.0', '--input', 'b.json', '--out-dir', './out', '--bogus', 'x']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - score', () => {
  it('parses a score command', () => {
    expect(parseCliArgs(['score', '--target', 'openrca-1.0', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'openrca-1.0', dir: './exported' },
    });
  });

  it('parses a score command with anchors', () => {
    expect(parseCliArgs(['score', '--target', 'rcaeval-re2', '--anchors', '{}', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'rcaeval-re2', anchors: '{}', dir: './exported' },
    });
  });

  it('parses an RCA100 score command', () => {
    expect(parseCliArgs(['score', '--target', 'rca100', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'rca100', dir: './exported' },
    });
  });

  it('parses an AIOps2025 score command', () => {
    expect(parseCliArgs(['score', '--target', 'aiops2025', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'aiops2025', dir: './exported' },
    });
  });

  it('parses a Cloud-OpsBench score command', () => {
    expect(parseCliArgs(['score', '--target', 'cloud-opsbench', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'cloud-opsbench', dir: './exported' },
    });
  });

  it('parses an OpenRCA 2.0 score command', () => {
    expect(parseCliArgs(['score', '--target', 'openrca-2.0', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'openrca-2.0', dir: './exported' },
    });
  });

  it('parses an ITBench score command', () => {
    expect(parseCliArgs(['score', '--target', 'itbench', '--dir', './exported'])).toEqual({
      ok: true,
      command: { command: 'score', target: 'itbench', dir: './exported' },
    });
  });

  it('requires --target', () => {
    const result = parseCliArgs(['score', '--dir', './exported']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('requires --dir', () => {
    const result = parseCliArgs(['score', '--target', 'openrca-1.0']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/dir/i);
  });

  it('rejects an invalid --target', () => {
    const result = parseCliArgs(['score', '--target', 'bogus', '--dir', './exported']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('rejects malformed --anchors JSON', () => {
    const result = parseCliArgs(['score', '--target', 'openrca-1.0', '--anchors', 'not-json', '--dir', './exported']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/anchors/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['score', '--target', 'openrca-1.0', '--dir', './exported', '--bogus', 'x']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - transform', () => {
  it('parses a minimal transform command', () => {
    expect(parseCliArgs(['transform', '--input', 'src.json', '--rules', 'rules.json'])).toEqual({
      ok: true,
      command: { command: 'transform', input: 'src.json', rules: 'rules.json' },
    });
  });

  it('parses the optional --output and --id-field', () => {
    expect(parseCliArgs(['transform', '--input', 'src.json', '--rules', 'rules.json', '--output', 'out.json', '--id-field', 'id'])).toEqual({
      ok: true,
      command: { command: 'transform', input: 'src.json', rules: 'rules.json', output: 'out.json', idField: 'id' },
    });
  });

  it('requires --input', () => {
    const result = parseCliArgs(['transform', '--rules', 'rules.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --rules', () => {
    const result = parseCliArgs(['transform', '--input', 'src.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rules/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['transform', '--input', 'x', '--rules', 'y', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - gate', () => {
  it('parses a gate command', () => {
    expect(parseCliArgs(['gate', '--input', 'bundle.json', '--target', 'rca100'])).toEqual({
      ok: true,
      command: { command: 'gate', input: 'bundle.json', target: 'rca100' },
    });
  });

  it('parses an optional --gate-run-id', () => {
    expect(parseCliArgs(['gate', '--input', 'bundle.json', '--target', 'openrca-1.0', '--gate-run-id', 'run-1'])).toEqual({
      ok: true,
      command: { command: 'gate', input: 'bundle.json', target: 'openrca-1.0', gateRunId: 'run-1' },
    });
  });

  it('requires --input', () => {
    const result = parseCliArgs(['gate', '--target', 'rca100']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --target', () => {
    const result = parseCliArgs(['gate', '--input', 'bundle.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('rejects an invalid --target', () => {
    const result = parseCliArgs(['gate', '--input', 'bundle.json', '--target', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['gate', '--input', 'x', '--target', 'rca100', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - case', () => {
  it('parses a minimal case command', () => {
    expect(parseCliArgs(['case', '--input', 'draft.json'])).toEqual({
      ok: true,
      command: { command: 'case', input: 'draft.json' },
    });
  });

  it('parses an optional --output', () => {
    expect(parseCliArgs(['case', '--input', 'draft.json', '--output', 'bundle.json'])).toEqual({
      ok: true,
      command: { command: 'case', input: 'draft.json', output: 'bundle.json' },
    });
  });

  it('requires --input', () => {
    const result = parseCliArgs(['case']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['case', '--input', 'x', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - report', () => {
  it('parses a minimal report command', () => {
    expect(parseCliArgs(['report', '--input', 'bundle.json'])).toEqual({
      ok: true,
      command: { command: 'report', input: 'bundle.json' },
    });
  });

  it('parses a report command with a title, target and output', () => {
    expect(parseCliArgs(['report', '--input', 'bundle.json', '--title', 'Report', '--target', 'rca100', '--output', 'r.html'])).toEqual({
      ok: true,
      command: { command: 'report', input: 'bundle.json', title: 'Report', target: 'rca100', output: 'r.html' },
    });
  });

  it('requires --input', () => {
    const result = parseCliArgs(['report']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('rejects an invalid --target', () => {
    const result = parseCliArgs(['report', '--input', 'bundle.json', '--target', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target/i);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['report', '--input', 'x', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - evolve', () => {
  it('parses a minimal evolve propose command', () => {
    expect(parseCliArgs(['evolve', 'propose', '--input', 'draft.json'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'propose', input: 'draft.json' },
    });
  });

  it('parses an evolve propose command with an output', () => {
    expect(parseCliArgs(['evolve', 'propose', '--input', 'draft.json', '--output', 'proposal.json'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'propose', input: 'draft.json', output: 'proposal.json' },
    });
  });

  it('parses a minimal evolve approve command', () => {
    expect(parseCliArgs(['evolve', 'approve', '--input', 'proposal.json'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'approve', input: 'proposal.json' },
    });
  });

  it('parses an evolve approve command with a note', () => {
    expect(parseCliArgs(['evolve', 'approve', '--input', 'proposal.json', '--note', 'ship it'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'approve', input: 'proposal.json', note: 'ship it' },
    });
  });

  it('parses an evolve approve command with a note and output', () => {
    expect(parseCliArgs(['evolve', 'approve', '--input', 'proposal.json', '--note', 'ok', '--output', 'approved.json'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'approve', input: 'proposal.json', note: 'ok', output: 'approved.json' },
    });
  });

  it('parses a minimal evolve reject command', () => {
    expect(parseCliArgs(['evolve', 'reject', '--input', 'proposal.json'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'reject', input: 'proposal.json' },
    });
  });

  it('parses an evolve reject command with a note', () => {
    expect(parseCliArgs(['evolve', 'reject', '--input', 'proposal.json', '--note', 'regression gap'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'reject', input: 'proposal.json', note: 'regression gap' },
    });
  });

  it('parses an evolve reject command with an output', () => {
    expect(parseCliArgs(['evolve', 'reject', '--input', 'proposal.json', '--output', 'rejected.json'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'reject', input: 'proposal.json', output: 'rejected.json' },
    });
  });

  it('parses an evolve stale command with cases', () => {
    expect(parseCliArgs(['evolve', 'stale', '--input', 'proposal.json', '--cases', '["case-001"]'])).toEqual({
      ok: true,
      command: { command: 'evolve', action: 'stale', input: 'proposal.json', cases: '["case-001"]' },
    });
  });

  it('requires an action', () => {
    const result = parseCliArgs(['evolve']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/action/i);
  });

  it('rejects an unknown action', () => {
    const result = parseCliArgs(['evolve', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/action/i);
  });

  it('requires --input for propose', () => {
    const result = parseCliArgs(['evolve', 'propose']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --input for approve', () => {
    const result = parseCliArgs(['evolve', 'approve']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --input for reject', () => {
    const result = parseCliArgs(['evolve', 'reject']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --input for stale', () => {
    const result = parseCliArgs(['evolve', 'stale']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/input/i);
  });

  it('requires --cases for stale', () => {
    const result = parseCliArgs(['evolve', 'stale', '--input', 'proposal.json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cases/i);
  });

  it('rejects malformed --cases JSON', () => {
    const result = parseCliArgs(['evolve', 'stale', '--input', 'proposal.json', '--cases', 'not-json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cases/i);
  });

  it('rejects an unknown flag for propose', () => {
    const result = parseCliArgs(['evolve', 'propose', '--input', 'x', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });

  it('rejects an unknown flag for approve', () => {
    const result = parseCliArgs(['evolve', 'approve', '--input', 'x', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });

  it('rejects an unknown flag for reject', () => {
    const result = parseCliArgs(['evolve', 'reject', '--input', 'x', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });

  it('rejects an unknown flag for stale', () => {
    const result = parseCliArgs(['evolve', 'stale', '--input', 'x', '--cases', '[]', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - pack', () => {
  it('parses a minimal pack command', () => {
    expect(parseCliArgs(['pack', '--input', 'examples/order-prod', '--output', 'pack.tar.gz'])).toEqual({
      ok: true,
      command: { command: 'pack', input: 'examples/order-prod', output: 'pack.tar.gz' },
    });
  });

  it('keeps an explicit prefix', () => {
    expect(parseCliArgs(['pack', '--input', 'src', '--output', 'pack.tar.gz', '--prefix', 'bundle'])).toEqual({
      ok: true,
      command: { command: 'pack', input: 'src', output: 'pack.tar.gz', prefix: 'bundle' },
    });
  });

  it('requires --input', () => {
    const result = parseCliArgs(['pack', '--output', 'pack.tar.gz']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--input/);
  });

  it('requires --output', () => {
    const result = parseCliArgs(['pack', '--input', 'src']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--output/);
  });

  it('rejects empty --input and --output values', () => {
    expect(parseCliArgs(['pack', '--input', '', '--output', 'pack.tar.gz']).ok).toBe(false);
    expect(parseCliArgs(['pack', '--input', 'src', '--output', '']).ok).toBe(false);
  });

  it('rejects an empty --prefix', () => {
    const result = parseCliArgs(['pack', '--input', 'src', '--output', 'pack.tar.gz', '--prefix', '']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--prefix/);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['pack', '--input', 'src', '--output', 'pack.tar.gz', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('parseCliArgs - official', () => {
  it('parses the bundle mode that exports every target', () => {
    expect(parseCliArgs(['official', '--input', 'bundle.json'])).toEqual({
      ok: true,
      command: { command: 'official', mode: 'bundle', input: 'bundle.json' },
    });
  });

  it('parses the directory mode for one exported target', () => {
    expect(parseCliArgs(['official', '--target', 'openrca-1.0', '--dir', 'exported'])).toEqual({
      ok: true,
      command: { command: 'official', mode: 'dir', target: 'openrca-1.0', dir: 'exported' },
    });
  });

  it('keeps the optional reason and output file in both modes', () => {
    expect(
      parseCliArgs(['official', '--input', 'b.json', '--allow-empty-reason', 'RE3 targets code faults', '--output', 'r.json']),
    ).toEqual({
      ok: true,
      command: {
        command: 'official',
        mode: 'bundle',
        input: 'b.json',
        allowEmptyReason: 'RE3 targets code faults',
        output: 'r.json',
      },
    });
    expect(parseCliArgs(['official', '--target', 'rca100', '--dir', 'out', '--output', 'r.json'])).toEqual({
      ok: true,
      command: { command: 'official', mode: 'dir', target: 'rca100', dir: 'out', output: 'r.json' },
    });
  });

  it('rejects mixing the two modes', () => {
    const result = parseCliArgs(['official', '--input', 'b.json', '--target', 'rca100', '--dir', 'out']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not both/);
  });

  it('requires a mode', () => {
    const result = parseCliArgs(['official']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/requires either --input/);
  });

  it('requires --dir once --target is given', () => {
    const result = parseCliArgs(['official', '--target', 'rca100']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--dir/);
  });

  it('validates --target against the score targets', () => {
    const result = parseCliArgs(['official', '--target', 'nope', '--dir', 'out']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid --target/);
  });

  it('rejects empty flag values', () => {
    expect(parseCliArgs(['official', '--input', '']).ok).toBe(false);
    expect(parseCliArgs(['official', '--target', 'rca100', '--dir', '']).ok).toBe(false);
    expect(parseCliArgs(['official', '--input', 'b.json', '--allow-empty-reason', '']).ok).toBe(false);
  });

  it('rejects an unknown flag', () => {
    const result = parseCliArgs(['official', '--input', 'b.json', '--bogus', 'z']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bogus|unknown/i);
  });
});

describe('formatHelp and formatVersion', () => {
  it('lists every command in the help text', () => {
    const help = formatHelp();
    for (const cmd of ['source', 'transform', 'case', 'gate', 'export', 'score', 'official', 'report', 'pack', 'evolve', 'help', 'version']) {
      expect(help).toContain(cmd);
    }
  });

  it('returns a semantic-version string', () => {
    expect(formatVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
