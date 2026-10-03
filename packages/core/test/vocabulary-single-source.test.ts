import { describe, expect, it } from 'vitest';
import { ingestFile } from '../src/ingest/file.js';
import { parseFaultSpec } from '../src/fault/collector.js';
import { checkAioPs2025Structure, AIOPS2025_INSTANCE_TYPES, ITBENCH_SCENARIO_DOMAINS } from '../src/score/score.js';
import { AIOPS2025_CATEGORIES } from '../src/export/aiops2025.js';
import { CLOUD_OPSBENCH_TAXONOMIES, TAXONOMY_BY_CATEGORY } from '../src/export/cloudopsbench.js';
import { DIFFICULTIES } from '../src/export/difficulty.js';
import { ITBENCH_SCENARIO_CLASSES, ITBENCH_SRE_DOMAIN, CLASS_BY_CATEGORY } from '../src/export/itbench.js';
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

/** The projection table's image, as published in `docs/targets/aiops2025.md`. */
const DOCUMENTED_AIOPS2025_TABLE_VALUES = [
  'network',
  'stress',
  'node',
  'pod',
  'jvm',
  'dns',
  'misconfiguration',
  'erroneous-change',
  'io',
];

/**
 * `docs/targets/aiops2025.md` — the words `fault_category` can carry.
 *
 * The table's image first, then the IR categories the table falls back to, which
 * is the order `AIOPS2025_CATEGORIES` composes them in: `Object.values` of the
 * projection table, then `FAULT_CATEGORIES`. `network` sits in both halves and
 * so appears once, which is why the tail is the IR categories *deduplicated*
 * against the table image rather than the vocabulary verbatim.
 *
 * The anchor is a deliberate third copy of the *documented* domain — it is what
 * makes a documentation edit that forgets the code, or a code edit that forgets
 * the documentation, fail here.
 */
const DOCUMENTED_AIOPS2025_CATEGORIES = [
  ...DOCUMENTED_AIOPS2025_TABLE_VALUES,
  ...DOCUMENTED_FAULT_CATEGORIES.filter((c) => !DOCUMENTED_AIOPS2025_TABLE_VALUES.includes(c)),
];

/** `docs/targets/itbench.md` — the only `scenario_domain` an SRE scenario carries. */
const DOCUMENTED_ITBENCH_SCENARIO_DOMAINS = ['SRE'];

/**
 * `docs/targets/itbench.md` — the `scenario_class` column, one row per IR category.
 *
 * The row order is the IR category order, which is what the exporter's
 * `CLASS_BY_CATEGORY` record is keyed on, so this is the table as published
 * rather than its image. The image is composed from it below.
 */
const DOCUMENTED_ITBENCH_CLASS_TABLE = [
  'HighCPU', // resource
  'NetworkPartition', // network
  'CrashLoopBackOff', // runtime
  'ServiceDegradation', // middleware
  'CorruptImage', // code
  'Misconfiguration', // config
  'DependencyFailure', // dependency
  'Unknown', // unknown
];

/** The `scenario_class` image: the published table, deduplicated. */
const DOCUMENTED_ITBENCH_SCENARIO_CLASSES = [...new Set(DOCUMENTED_ITBENCH_CLASS_TABLE)];

/** `docs/targets/itbench.md` and `docs/targets/cloud-opsbench.md` — the shared word set. */
const DOCUMENTED_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * `docs/targets/cloud-opsbench.md` — the `result.fault_taxonomy` column, one row
 * per IR category, before deduplication.
 *
 * Two collapses are load-bearing and both are visible here as repeated values:
 * `middleware` and `dependency` share `Service_Fault`, and `runtime` and
 * `unknown` share `Runtime_Fault`. Eight rows, six words.
 */
const DOCUMENTED_TAXONOMY_TABLE = [
  'Performance_Fault', // resource
  'Infrastructure_Fault', // network
  'Runtime_Fault', // runtime
  'Service_Fault', // middleware
  'Code_Fault', // code
  'Startup_Fault', // config
  'Service_Fault', // dependency
  'Runtime_Fault', // unknown
];

/** The `fault_taxonomy` image: the published table, deduplicated. */
const DOCUMENTED_CLOUD_OPSBENCH_TAXONOMIES = [...new Set(DOCUMENTED_TAXONOMY_TABLE)];

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

describe('AIOps2025 fault categories · a union of two sources, not a third list', () => {
  it('is exactly the documented domain, in documented order', () => {
    expect([...AIOPS2025_CATEGORIES]).toEqual(DOCUMENTED_AIOPS2025_CATEGORIES);
  });

  it('carries every category the IR can hand the fallback', () => {
    // The IR half. Without it the vocabulary would describe only the projection
    // table, and the values the emitter produces for the 16 corpus types the
    // table does not hold would be rejected by the scorer that reads this list.
    for (const category of FAULT_CATEGORIES) {
      expect(AIOPS2025_CATEGORIES, `${category} is not admitted`).toContain(category);
    }
  });

  it('carries the table image as a prefix, so the table half stays derived', () => {
    // Order is the assertion: the union puts `Object.values(table)` first, so a
    // row whose value changes moves this prefix and fails here, rather than
    // silently disagreeing with the documentation.
    expect([...AIOPS2025_CATEGORIES].slice(0, DOCUMENTED_AIOPS2025_TABLE_VALUES.length)).toEqual(
      DOCUMENTED_AIOPS2025_TABLE_VALUES,
    );
  });
});

describe('ITBench scenario domain · a one-word contract', () => {
  it('is exactly the documented domain', () => {
    expect([...ITBENCH_SCENARIO_DOMAINS]).toEqual(DOCUMENTED_ITBENCH_SCENARIO_DOMAINS);
  });

  it('is derived from the exporter constant rather than restating it', () => {
    // The vocabulary's single member must BE the exporter's constant, not an
    // equal-looking literal. Widening the exporter to target a second persona
    // then moves this vocabulary with it, and the documented anchor above fails
    // until the documentation follows.
    expect([...ITBENCH_SCENARIO_DOMAINS]).toEqual([ITBENCH_SRE_DOMAIN]);
  });

  it('refuses the personas this converter does not target', () => {
    // The reason the contract is worth having: `CISO` and `FinOps` are real
    // ITBench personas, so their absence is a decision, not an oversight.
    expect(ITBENCH_SCENARIO_DOMAINS).not.toContain('CISO');
    expect(ITBENCH_SCENARIO_DOMAINS).not.toContain('FinOps');
  });
});

describe('ITBench scenario class · a map image, not a third list', () => {
  it('is exactly the documented image, in documented order', () => {
    expect([...ITBENCH_SCENARIO_CLASSES]).toEqual(DOCUMENTED_ITBENCH_SCENARIO_CLASSES);
  });

  it('carries every class the projection table can produce', () => {
    for (const category of FAULT_CATEGORIES) {
      expect(ITBENCH_SCENARIO_CLASSES, `${category} projects to an unlisted class`).toContain(
        CLASS_BY_CATEGORY[category],
      );
    }
  });

  it('carries nothing the table cannot produce', () => {
    // Containment in the other direction. A vocabulary wider than the image would
    // admit words no export can carry, which is the failure mode the derivation
    // exists to make impossible.
    for (const word of ITBENCH_SCENARIO_CLASSES) {
      expect(Object.values(CLASS_BY_CATEGORY), `${word} is not a table value`).toContain(word);
    }
  });

  it('has no duplicate, so the dedup is a no-op that stays honest', () => {
    expect(new Set(ITBENCH_SCENARIO_CLASSES).size).toBe(ITBENCH_SCENARIO_CLASSES.length);
  });
});

describe('difficulty · one vocabulary, two fields', () => {
  it('is exactly the documented word set, in documented order', () => {
    expect([...DIFFICULTIES]).toEqual(DOCUMENTED_DIFFICULTIES);
  });

  it('is shared: both projection tables are reachable from one word set', () => {
    // `itbench` publishes this as `scenario_complexity` and `cloud-opsbench` as
    // `difficulty`. The vocabulary is one, so neither exporter can widen it
    // alone -- an edit here moves both fields at once, which is the point of
    // extracting the byte-identical pair.
    expect(DIFFICULTIES.length).toBe(DOCUMENTED_DIFFICULTIES.length);
    expect(new Set(DIFFICULTIES).size).toBe(DIFFICULTIES.length);
  });
});

describe('Cloud-OpsBench fault taxonomy · a map image, not a third list', () => {
  it('is exactly the documented image, in documented order', () => {
    expect([...CLOUD_OPSBENCH_TAXONOMIES]).toEqual(DOCUMENTED_CLOUD_OPSBENCH_TAXONOMIES);
  });

  it('carries every taxonomy the projection table can produce', () => {
    for (const category of FAULT_CATEGORIES) {
      expect(CLOUD_OPSBENCH_TAXONOMIES, `${category} projects to an unlisted taxonomy`).toContain(
        TAXONOMY_BY_CATEGORY[category],
      );
    }
  });

  it('carries nothing the table cannot produce', () => {
    for (const word of CLOUD_OPSBENCH_TAXONOMIES) {
      expect(Object.values(TAXONOMY_BY_CATEGORY), `${word} is not a table value`).toContain(word);
    }
  });

  it('collapses eight rows to six words, and the collapse is the dedup', () => {
    // The figure that makes the dedup load-bearing rather than defensive. Two
    // rows share `Service_Fault` and two share `Runtime_Fault`; without the
    // `new Set` the vocabulary would carry eight entries and admit nothing extra.
    expect(Object.keys(TAXONOMY_BY_CATEGORY).length).toBe(8);
    expect(CLOUD_OPSBENCH_TAXONOMIES.length).toBe(6);
    expect(new Set(Object.values(TAXONOMY_BY_CATEGORY)).size).toBe(6);
  });
});
