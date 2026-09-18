import { describe, expect, it } from 'vitest';
import { ingestFile } from '../src/ingest/file.js';
import { parseFaultSpec } from '../src/fault/collector.js';
import { checkAioPs2025Structure, AIOPS2025_INSTANCE_TYPES } from '../src/score/score.js';
import { EXPORTERS } from '../src/score/dispatch.js';
import { formatCommandHelp, parseCliArgs, HELP_TOPICS } from '../src/cli/args.js';
import {
  ENTITY_KINDS,
  FAULT_CATEGORIES,
  LOG_SEVERITIES,
  SPAN_STATUSES,
} from '../src/ir/types.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { validBundle } from './fixtures.js';

/**
 * Six vocabularies that were each declared twice.
 *
 * Each had a union (or a keyed record) that the compiler was already exhaustive
 * over, and a hand-written `readonly string[]` beside it that decided what the
 * code actually admits. `readonly string[]` constrains nothing -- `string`
 * contains everything -- so the copy could drift in either direction while the
 * union stayed inside the compiler's net. Measured before the fix, both packages
 * running:
 *
 *   SEVERITY_LEVELS          - WARN     -> 1 failure, incidentally
 *   SEVERITY_LEVELS          + GHOST    -> 1608 + 173 green, SILENT
 *   SEVERITY_LEVELS          reorder    -> 1608 + 173 green, SILENT
 *   SPAN_STATUSES            - UNSET    -> 1608 + 173 green, SILENT
 *   SPAN_STATUSES            + TIMEOUT  -> 1608 + 173 green, SILENT
 *   EXPORT_TARGETS           + ghost    -> 1608 + 173 green, SILENT
 *   AIOPS2025_INSTANCE_TYPES - pod      -> 1608 + 173 green, SILENT
 *   AIOPS2025_INSTANCE_TYPES + container-> 1608 + 173 green, SILENT
 *   FAULT_CATEGORIES         - dependency -> 1608 + 173 green, SILENT
 *   FAULT_CATEGORIES         + ghost    -> 1608 + 173 green, SILENT
 *   HELP_TOPICS              reorder    -> 1608 + 173 green, SILENT
 *
 * Removing `WARN` from `SEVERITY_LEVELS` was caught only because one prime
 * ingestion fixture happens to carry a `WARN` line -- a test written for another
 * purpose, in the same way `FILE_FORMATS - tsv` was caught before iteration 20.
 * An incidental catch is not coverage.
 *
 * The unions themselves were already guarded: every one of
 * `severityText - WARN`, `status - UNSET`, `FaultCategory ± member`,
 * `EntityKind - pod` and `ExportTarget ± member` fails `tsc`. So the fix is not
 * a new runtime net overlapping an existing one -- it is deleting the
 * restatement so the consumer stands inside the net that already exists.
 *
 * Every `DOCUMENTED_*` constant below is deliberately a third copy: an anchor is
 * not a duplicate. Each mirrors a file outside the code --
 * `docs/data-model.md`, `docs/targets/aiops2025.md`, `docs/cli-reference.md` --
 * which is the only place the fact is published for a reader who cannot read the
 * source. Order is asserted because membership is not enough: a reordered
 * vocabulary still contains every member, and the order is what the help text
 * and the reference actually show.
 */

/** `docs/data-model.md` — `LogPayload.severityText`. */
const DOCUMENTED_LOG_SEVERITIES = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/** `docs/data-model.md` — `TracePayload.status`. */
const DOCUMENTED_SPAN_STATUSES = ['OK', 'ERROR', 'UNSET'];

/** `docs/data-model.md` — `FaultCategory`, in the order it is published there. */
const DOCUMENTED_FAULT_CATEGORIES = [
  'resource',
  'network',
  'runtime',
  'middleware',
  'code',
  'config',
  'dependency',
  'unknown',
];

/** `docs/data-model.md` — `EntityKind`. */
const DOCUMENTED_ENTITY_KINDS = [
  'service',
  'pod',
  'node',
  'container',
  'db',
  'mq',
  'host',
  'cluster',
  'external',
];

/** `docs/targets/aiops2025.md` — the `instance_type` layers AIOps2025 scores. */
const DOCUMENTED_AIOPS2025_INSTANCE_TYPES = ['service', 'pod', 'node'];

/**
 * `docs/cli-reference.md` — the `--target` values `rca-bench export` lists, in
 * the order the binary advertises them.
 *
 * The binary is the judge and the reference already agrees with it, so what is
 * being asserted here is that they keep agreeing. A doc that lists the same
 * seven names in a different order is not wrong about any single name, which is
 * exactly why order needs its own assertion: `ingest --target` legitimately
 * starts with `rcaeval` (it names prime datasets, not export targets), so a
 * reader cannot tell an intentional difference from a drift by membership.
 */
const DOCUMENTED_EXPORT_TARGETS = [
  'openrca-1.0',
  'openrca-2.0',
  'rcaeval',
  'rca100',
  'aiops2025',
  'cloud-opsbench',
  'itbench',
];

/**
 * `docs/cli-reference.md` — the commands, in its own order, minus `help` and
 * `version`, which `parseCliArgs` handles itself and which therefore own no
 * `COMMAND_SPECS` entry.
 */
const DOCUMENTED_HELP_TOPICS = [
  'source',
  'ingest',
  'transform',
  'case',
  'gate',
  'export',
  'score',
  'official',
  'report',
  'pack',
  'evolve',
];

/** The values a flag's `--help` entry offers, read back out of the rendered text. */
function placeholder(command: string, flag: string): string[] {
  const line = formatCommandHelp(command)
    .split('\n')
    .find((l) => new RegExp(`^\\s+--${flag}\\s+<`).test(l));
  if (line === undefined) throw new Error(`'${command} --help' does not advertise --${flag}`);
  const match = line.match(/<([^>]+)>/);
  if (match === null) throw new Error(`--${flag} has no bar-separated placeholder`);
  return match[1].split('|');
}

/** The values the parser names when it refuses an out-of-vocabulary one. */
function refusalNames(argv: string[]): string[] {
  const result = parseCliArgs(argv);
  if (result.ok) throw new Error(`expected a refusal, got ${JSON.stringify(result.command)}`);
  const match = result.error.match(/\(expected ([^)]+)\)/);
  if (match === null) throw new Error(`the refusal does not name the admitted values: ${result.error}`);
  return match[1].split('|');
}

/** One log row carrying `severity`, run through the real file reader. */
function ingestLog(severity: string): { severityText?: string; quarantined: number } {
  const body = `ts,service,severity,body\n2025-03-01T00:09:00.000Z,checkout,${severity},disk pressure\n`;
  const result = ingestFile(body, {
    format: 'csv',
    signalKind: 'log',
    layout: { timestamp: 'ts', service: 'service', severity: 'severity', logBody: 'body' },
    timeLayout: 'iso8601',
  });
  const payload = result.signals[0]?.payload;
  return {
    ...(payload?.kind === 'log' ? { severityText: payload.severityText } : {}),
    quarantined: result.quarantine.length,
  };
}

/** One trace row carrying `status`, run through the real file reader. */
function ingestSpan(status: string): { spanStatus?: string; quarantined: number } {
  const body =
    `ts,service,trace_id,span_id,span_name,duration_ms,status\n` +
    `2025-03-01T00:09:00.000Z,checkout,t1,s1,checkout,120,${status}\n`;
  const result = ingestFile(body, {
    format: 'csv',
    signalKind: 'trace',
    layout: {
      timestamp: 'ts',
      service: 'service',
      traceId: 'trace_id',
      spanId: 'span_id',
      spanName: 'span_name',
      durationMs: 'duration_ms',
      status: 'status',
    },
    timeLayout: 'iso8601',
  });
  const payload = result.signals[0]?.payload;
  return {
    ...(payload?.kind === 'trace' ? { spanStatus: payload.status } : {}),
    quarantined: result.quarantine.length,
  };
}

/** An AIOps2025 export whose ground truth claims one `instance_type`. */
function aiopsFilesWith(instanceType: string): Record<string, string> {
  const files = exportAioPs2025(validBundle()).files;
  const raw = files['groundtruth.jsonl'];
  if (raw === undefined) throw new Error('the AIOps2025 export has no groundtruth.jsonl');
  const entry = JSON.parse(raw.trim()) as Record<string, unknown>;
  files['groundtruth.jsonl'] = `${JSON.stringify({ ...entry, instance_type: instanceType })}\n`;
  return files;
}

describe('log severity · declared once, admitted once', () => {
  it('is exactly the documented vocabulary, in documented order', () => {
    expect([...LOG_SEVERITIES]).toEqual(DOCUMENTED_LOG_SEVERITIES);
  });

  it.each(DOCUMENTED_LOG_SEVERITIES)('reaches the IR payload as %s', (severity) => {
    // Capability, not just exhaustiveness: the value must survive the reader
    // and land in the payload, not merely fail to be refused.
    expect(ingestLog(severity)).toEqual({ severityText: severity, quarantined: 0 });
  });

  it('refuses a severity outside the vocabulary', () => {
    const result = ingestLog('NOTICE');
    expect(result.severityText).toBeUndefined();
    expect(result.quarantined).toBe(1);
  });
});

describe('span status · declared once, admitted once', () => {
  it('is exactly the documented vocabulary, in documented order', () => {
    expect([...SPAN_STATUSES]).toEqual(DOCUMENTED_SPAN_STATUSES);
  });

  it.each(DOCUMENTED_SPAN_STATUSES)('reaches the IR payload as %s', (status) => {
    expect(ingestSpan(status)).toEqual({ spanStatus: status, quarantined: 0 });
  });

  it('refuses a status outside the vocabulary', () => {
    const result = ingestSpan('TIMEOUT');
    expect(result.spanStatus).toBeUndefined();
    expect(result.quarantined).toBe(1);
  });
});

describe('fault category · declared once, admitted once', () => {
  it('is exactly the documented vocabulary, in documented order', () => {
    expect([...FAULT_CATEGORIES]).toEqual(DOCUMENTED_FAULT_CATEGORIES);
  });

  it.each(DOCUMENTED_FAULT_CATEGORIES)('%s is admitted by the spec parser', (category) => {
    const result = parseFaultSpec({ type: 'cpu-saturation', category }, 'chaos-mesh');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.category).toBe(category);
  });

  it('refuses a category outside the vocabulary', () => {
    const result = parseFaultSpec({ type: 'cpu-saturation', category: 'ghost' }, 'chaos-mesh');
    expect(result.ok).toBe(false);
  });
});

describe('entity kind · declared once', () => {
  it('is exactly the documented vocabulary, in documented order', () => {
    expect([...ENTITY_KINDS]).toEqual(DOCUMENTED_ENTITY_KINDS);
  });
});

describe('AIOps2025 instance types · a narrowing of the IR vocabulary, not a copy', () => {
  it('is exactly the documented layers, in documented order', () => {
    expect([...AIOPS2025_INSTANCE_TYPES]).toEqual(DOCUMENTED_AIOPS2025_INSTANCE_TYPES);
  });

  it('names only kinds the IR actually has', () => {
    // This is what separates a narrowing from a stale copy: every member must
    // still exist in `EntityKind`, so dropping one there narrows this list
    // rather than leaving it claiming a kind the IR no longer has.
    for (const kind of AIOPS2025_INSTANCE_TYPES) {
      expect(ENTITY_KINDS).toContain(kind);
    }
  });

  it('is a strict subset of the entity kinds', () => {
    expect(AIOPS2025_INSTANCE_TYPES.length).toBeLessThan(ENTITY_KINDS.length);
  });

  it.each(DOCUMENTED_AIOPS2025_INSTANCE_TYPES)('%s passes the structure check', (type) => {
    const report = checkAioPs2025Structure(aiopsFilesWith(type));
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(true);
  });

  it('refuses an instance type the format does not score', () => {
    const report = checkAioPs2025Structure(aiopsFilesWith('container'));
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(false);
  });
});

describe('export target · declared once, admitted once', () => {
  it('advertises exactly the documented targets, in documented order', () => {
    expect(placeholder('export', 'target')).toEqual(DOCUMENTED_EXPORT_TARGETS);
  });

  it('names exactly the documented targets, in documented order', () => {
    const argv = ['export', '--target', 'not-a-target', '--input', 'a.json', '--out-dir', 'o'];
    expect(refusalNames(argv)).toEqual(DOCUMENTED_EXPORT_TARGETS);
  });

  it.each(DOCUMENTED_EXPORT_TARGETS)('%s is admitted and has an exporter', (target) => {
    const result = parseCliArgs(['export', '--target', target, '--input', 'a.json', '--out-dir', 'o']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command).toMatchObject({ target });
    // Reachable is not the same as implemented: `Record<ExportTarget, …>`
    // proves every key is answered, never that it was answered with the right
    // exporter, so the table is read at run time.
    expect(typeof EXPORTERS[target]).toBe('function');
  });

  it('has no exporter beyond the documented targets', () => {
    expect(Object.keys(EXPORTERS).sort()).toEqual([...DOCUMENTED_EXPORT_TARGETS].sort());
  });

  it('refuses a target outside the vocabulary', () => {
    const argv = ['export', '--target', 'ghost', '--input', 'a.json', '--out-dir', 'o'];
    expect(parseCliArgs(argv).ok).toBe(false);
  });
});

describe('help topics · declared once, admitted once', () => {
  it('is exactly the documented commands, in documented order', () => {
    expect([...HELP_TOPICS]).toEqual(DOCUMENTED_HELP_TOPICS);
  });

  it.each(DOCUMENTED_HELP_TOPICS)('%s renders a usage line', (topic) => {
    // A topic that is listed but has no `COMMAND_SPECS` entry would render an
    // empty help page, which is the failure a hand-maintained list invites.
    const rendered = formatCommandHelp(topic);
    expect(rendered).toContain(`rca-bench ${topic}`);
  });

  it('has no topic beyond the documented commands', () => {
    expect(HELP_TOPICS.length).toBe(DOCUMENTED_HELP_TOPICS.length);
  });
});
