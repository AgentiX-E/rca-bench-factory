import { describe, expect, it } from 'vitest';
import { formatHelp, formatVersion, parseCliArgs } from '../src/cli/args.js';

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

describe('formatHelp and formatVersion', () => {
  it('lists every command in the help text', () => {
    const help = formatHelp();
    for (const cmd of ['source', 'transform', 'case', 'gate', 'export', 'score', 'help', 'version']) {
      expect(help).toContain(cmd);
    }
  });

  it('returns a semantic-version string', () => {
    expect(formatVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
