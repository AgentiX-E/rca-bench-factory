import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestFile } from '../src/ingest/file.js';
import { parseFaultSpec } from '../src/fault/collector.js';
import { checkAioPs2025Structure, AIOPS2025_INSTANCE_TYPES, ITBENCH_SCENARIO_DOMAINS } from '../src/score/score.js';
import { AIOPS2025_CATEGORIES } from '../src/export/aiops2025.js';
import { CLOUD_OPSBENCH_TAXONOMIES, TAXONOMY_BY_CATEGORY } from '../src/export/cloudopsbench.js';
import { DIFFICULTIES } from '../src/export/difficulty.js';
import { ITBENCH_SCENARIO_CLASSES, ITBENCH_SRE_DOMAIN, CLASS_BY_CATEGORY } from '../src/export/itbench.js';
import { EXPORTERS } from '../src/score/dispatch.js';
import { FAULT_EXPECTATIONS } from '../src/gates/validity.js';
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

/**
 * The key set of an exhaustive projection table, asserted in both directions.
 *
 * `validity.ts` states the property for `FAULT_EXPECTATIONS` in prose: "total
 * over `FAULT_CATEGORIES` and both directions are asserted in the test suite, so
 * adding a category to the IR without deciding what it moves is a red suite
 * rather than a silent gap." That sentence describes four tables and was true of
 * one. This helper is the sentence as a function.
 *
 * Two directions, because they fail differently:
 *
 *   - A table *missing* a row is caught by the `Record<IRenum, string>`
 *     annotation at `tsc`. The loop re-states it at runtime so the guarantee
 *     survives compilation to `dist` and reaches any consumer that reads the
 *     compiled object rather than the source.
 *   - A table *carrying a row the IR does not admit* is caught by nothing. An
 *     excess key requires widening the annotation to make the program compile,
 *     and widening the annotation is the edit that removes the only guard. The
 *     sorted comparison is what makes that a red suite.
 */
function expectKeySetMatches(table: Record<string, unknown>, irEnum: readonly string[]): void {
  for (const member of irEnum) {
    expect(table[member], `${member} has no row in the projection table`).toBeDefined();
  }
  expect(Object.keys(table).sort()).toEqual([...irEnum].sort());
}

/**
 * Read a `const NAME: Record<..., ...> = { ... }` literal from a source file as
 * ordered rows, without importing it.
 *
 * `UMODEL_TYPE` is private to `rca100.ts`, so no test can name the object and
 * `Object.keys` cannot see it. Reading the declaration text is the weaker
 * mechanism and is stated as such: it establishes what the *source* declares,
 * not what the module exports at runtime. It is used for exactly one table, and
 * only because that table is the one the module deliberately keeps to itself --
 * the two tables that produce scored vocabularies are exported and get the
 * runtime assertion.
 *
 * The behavioural leg in `rca100.test.ts` (every `EntityKind` through
 * `buildTopologyJson`) is the second, independent statement: it reads the emitted
 * word, not the table.
 *
 * ## Why the declaration is matched with a boundary, and not `indexOf`
 *
 * The first version anchored with `source.indexOf(\`const ${name}\`)`. That is a
 * *prefix* match, and it is defeated by a rename. Injection BL splits the binding:
 * it renames the literal to `UMODEL_TYPE_TABLE` and rebinds `UMODEL_TYPE` to
 * `Object.assign({}, UMODEL_TYPE_TABLE, { ghostkind: 'apm.service' })`. Since
 * `const UMODEL_TYPE` is a prefix of `const UMODEL_TYPE_TABLE`, `indexOf` returns
 * the position of the *renamed* declaration in both the original and the mutated
 * source -- 2301 in each, measured -- so the helper silently read the one table the
 * mutation had deliberately moved out of the way and reported a clean nine rows.
 * Under that mutation the whole suite stayed green, all 118 tests, including this
 * file's four UModel assertions.
 *
 * A declaration whose name is a prefix of another declaration's name is therefore
 * matched, not by position, but by a name-boundary pattern: the identifier has to be
 * followed by something that cannot continue it. That makes `const UMODEL_TYPE` stop
 * matching `const UMODEL_TYPE_TABLE`, so the helper reads the binding it was asked
 * for or fails loudly -- which is the behaviour `expect` below states.
 */
function literalRows(source: string, name: string): [string, string][] {
  // `(?![\w$])` is the boundary: the next character must be one that cannot be part
  // of an identifier, so a longer name sharing this prefix does not match.
  const declaration = new RegExp(`\\bconst\\s+${name}(?![\\w$])`);
  const match = declaration.exec(source);
  expect(match, `${name} is not declared in the source`).not.toBeNull();
  const open = match === null ? -1 : match.index;
  const braceStart = source.indexOf('{', open);
  const braceEnd = source.indexOf('\n};', braceStart);
  expect(braceEnd, `${name} has no literal body`).toBeGreaterThan(braceStart);
  const body = source.slice(braceStart + 1, braceEnd);

  const rows: [string, string][] = [];
  for (const line of body.split('\n')) {
    // Strip the trailing comment first, so `key: 'value', // note, with comma`
    // cannot contribute a spurious row.
    const code = line.split('//')[0];
    const match = /^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'([^']*)'\s*,?\s*$/.exec(code);
    if (match) rows.push([match[1] ?? match[2], match[3]]);
  }
  return rows;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const RCA100_SOURCE = readFileSync(join(HERE, '../src/export/rca100.ts'), 'utf8');

describe('the declaration reader itself, because a reader that reads the wrong table is silent', () => {
  // `literalRows` is the only mechanism that can reach `UMODEL_TYPE`, which is
  // private to the module, so its correctness is load-bearing in a way the other
  // helpers' is not: if it resolves the wrong declaration it returns a *plausible*
  // table and every assertion built on it passes. That is not hypothetical. The
  // first version anchored on `indexOf('const UMODEL_TYPE')`, which also matches
  // `const UMODEL_TYPE_TABLE` because one name is a prefix of the other, and a
  // mutation that renames the literal out from under the binding therefore left
  // all four UModel assertions green. These tests pin the boundary rule.

  it('does not resolve a longer declaration that shares the name as a prefix', () => {
    // The exact shape injection BL produces: the literal is renamed and the original
    // name is rebound to an expression, so no literal body exists for the name asked for.
    const rebinding = [
      'const UMODEL_TYPE_TABLE: Record<EntityKind, string> = {',
      "  service: 'apm.service',",
      '};',
      '',
      'const UMODEL_TYPE: Record<EntityKind, string> = Object.assign({}, UMODEL_TYPE_TABLE);',
    ].join('\n');

    // The old `indexOf` anchor matched `const UMODEL_TYPE_TABLE` here and happily
    // returned that table. The boundary-aware reader must not: it has to fail, because
    // "the name I asked for has no literal" and "here is a different table" are
    // different answers and only the first one tells the truth.
    expect(() => literalRows(rebinding, 'UMODEL_TYPE')).toThrow(/UMODEL_TYPE has no literal body/);
    // And the renamed declaration is still readable under its own name, so the failure
    // is about the boundary rather than about the reader giving up on the file.
    expect(literalRows(rebinding, 'UMODEL_TYPE_TABLE')).toEqual([['service', 'apm.service']]);
  });

  it('reads the real declaration when both names are present in the real source', () => {
    // The other half of the rule: with the actual file, the boundary must not be so
    // strict that it rejects the declaration it is there to read.
    const rows = literalRows(RCA100_SOURCE, 'UMODEL_TYPE');
    expect(rows.length).toBe(DOCUMENTED_UMODEL_TABLE.length);
    expect(rows.map(([key]) => key)).toContain('external');
  });

  it('fails loudly when the name is absent rather than returning an empty table', () => {
    // An empty table would satisfy "every IR kind has a row" vacuously in the other
    // direction, so absence has to be a failure and not a zero.
    expect(() => literalRows(RCA100_SOURCE, 'NO_SUCH_TABLE')).toThrow(/is not declared in the source/);
  });
});

/**
 * `docs/targets/rca100.md` — the UModel type mapping, one row per IR kind.
 *
 * Transcribed from the published table at `docs/targets/rca100.md:43-51`, in
 * `ENTITY_KINDS` order so a lookup by kind is an index into this array. The
 * source record happens to be written in a different order (`host` before
 * `container`); that permutation is invisible in the output because every read is
 * `UMODEL_TYPE[kind]`, which is why this array is keyed by the IR rather than by
 * the literal.
 */
const DOCUMENTED_UMODEL_TABLE = [
  'apm.service', // service
  'k8s.pod', // pod
  'k8s.node', // node
  'k8s.pod', // container
  'apm.external.database', // db
  'apm.external.message', // mq
  'k8s.node', // host
  'k8s.cluster', // cluster
  'apm.external', // external
];

describe('every exhaustive projection table states its key set', () => {
  it('CLASS_BY_CATEGORY answers for every fault category, and no other', () => {
    expectKeySetMatches(CLASS_BY_CATEGORY, FAULT_CATEGORIES);
  });

  it('TAXONOMY_BY_CATEGORY answers for every fault category, and no other', () => {
    expectKeySetMatches(TAXONOMY_BY_CATEGORY, FAULT_CATEGORIES);
  });

  it('FAULT_EXPECTATIONS answers for every fault category, and no other', () => {
    // The table whose docstring states the property. Re-stated here so all four
    // tables are checked by one mechanism; `validity.test.ts` keeps its own
    // assertion, so this is a second statement rather than a relocation.
    expectKeySetMatches(FAULT_EXPECTATIONS, FAULT_CATEGORIES);
  });

  it('UMODEL_TYPE answers for every entity kind, and no other', () => {
    const rows = literalRows(RCA100_SOURCE, 'UMODEL_TYPE');
    expectKeySetMatches(Object.fromEntries(rows), ENTITY_KINDS);
  });

  it('the four tables agree on what "exhaustive" means, so no two can drift', () => {
    // The claim is one property over four tables, so the property is asserted
    // once over all four rather than trusted to four hand-written loops.
    const tables: [string, Record<string, unknown>, readonly string[]][] = [
      ['CLASS_BY_CATEGORY', CLASS_BY_CATEGORY, FAULT_CATEGORIES],
      ['TAXONOMY_BY_CATEGORY', TAXONOMY_BY_CATEGORY, FAULT_CATEGORIES],
      ['FAULT_EXPECTATIONS', FAULT_EXPECTATIONS, FAULT_CATEGORIES],
      ['UMODEL_TYPE', Object.fromEntries(literalRows(RCA100_SOURCE, 'UMODEL_TYPE')), ENTITY_KINDS],
    ];
    for (const [name, table, irEnum] of tables) {
      expect(Object.keys(table).length, `${name} row count`).toBe(irEnum.length);
    }
    // AIOPS2025_CATEGORY is the contrast and is deliberately absent: it is keyed
    // on fault-type strings rather than an IR enum, so "total over the enum" is
    // not a property it can have. Its own totality is asserted in the AIOps2025
    // describe above, against the two sources it is composed from.
    expect(AIOPS2025_CATEGORIES).toBeDefined();
  });
});

describe('each projection table matches its published rows, row by row', () => {
  // The image comparison above asks whether the *set* of emitted words is right.
  // It cannot see which row maps to which word, so a swap of two rows that leaves
  // the set unchanged passes it. These compare position by position, against the
  // published table rather than against the deduplicated image.

  it('itbench: the scenario_class column, one row per IR category, in order', () => {
    expect(Object.values(CLASS_BY_CATEGORY)).toEqual(DOCUMENTED_ITBENCH_CLASS_TABLE);
  });

  it('cloud-opsbench: the fault_taxonomy column, one row per IR category, in order', () => {
    expect(Object.values(TAXONOMY_BY_CATEGORY)).toEqual(DOCUMENTED_TAXONOMY_TABLE);
  });

  it('rca100: the UModel type column, one row per IR kind, keyed on the IR', () => {
    const rows = literalRows(RCA100_SOURCE, 'UMODEL_TYPE');
    // By key rather than by position, and deliberately so. `ENTITY_KINDS` order
    // is load-bearing -- `DOCUMENTED_ENTITY_KINDS` pins it and
    // `AIOPS2025_INSTANCE_TYPES` filters it -- but this record's order is not:
    // nothing calls `Object.values(UMODEL_TYPE)`, every read is
    // `UMODEL_TYPE[someKind]`, so a permutation emits identical output. Asserting
    // position here would pin an artifact of how the literal happens to be
    // written, which is the kind of assertion that gets relaxed rather than
    // fixed the first time someone reorders a table for readability.
    //
    // The row *set* is the claim that carries meaning, and it is asserted in both
    // directions: every IR kind has a row, and no row names a kind the IR does
    // not have (the key-set test above).
    expect(new Map(rows).size).toBe(rows.length);
    expect([...new Map(rows).keys()].sort()).toEqual([...ENTITY_KINDS].sort());
    for (const kind of ENTITY_KINDS) {
      const documented = DOCUMENTED_UMODEL_TABLE[ENTITY_KINDS.indexOf(kind)];
      expect(new Map(rows).get(kind), `${kind} maps to the wrong UModel type`).toBe(documented);
    }
  });

  it('the image is the deduplicated rows, so the one composition is the only composition', () => {
    // Ties the two comparisons together: the vocabulary each scorer checks
    // against is provably the image of the published table, not a parallel list
    // that happens to agree. It also names which tables collapse and which do
    // not, instead of leaving that to the reader of two separate describes.
    expect([...ITBENCH_SCENARIO_CLASSES]).toEqual([...new Set(DOCUMENTED_ITBENCH_CLASS_TABLE)]);
    expect([...CLOUD_OPSBENCH_TAXONOMIES]).toEqual([...new Set(DOCUMENTED_TAXONOMY_TABLE)]);
    expect(literalRows(RCA100_SOURCE, 'UMODEL_TYPE').length).toBe(DOCUMENTED_UMODEL_TABLE.length);
    expect(new Set(DOCUMENTED_UMODEL_TABLE).size).toBe(7);

    // The three cases, stated as figures rather than left implicit: itbench does
    // not collapse, the other two do.
    expect(new Set(DOCUMENTED_ITBENCH_CLASS_TABLE).size).toBe(DOCUMENTED_ITBENCH_CLASS_TABLE.length);
    expect(new Set(DOCUMENTED_TAXONOMY_TABLE).size).toBeLessThan(DOCUMENTED_TAXONOMY_TABLE.length);
    expect(new Set(DOCUMENTED_UMODEL_TABLE).size).toBeLessThan(DOCUMENTED_UMODEL_TABLE.length);
  });
});
