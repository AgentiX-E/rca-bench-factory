import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import type { FileFormat, FileSignalKind } from '../ingest/file.js';
import { PRIME_DATASET_IDS, type PrimeDatasetId } from '../ingest/prime.js';
import { entityGraphSchema } from '../ir/schema.js';
import type { Entity, EntityEdge } from '../ir/types.js';
import type { TimeLayout } from '../util/time.js';
import type { RcaEvalSuite } from '../export/rcaeval.js';
import { SCORE_TARGET_IDS } from '../score/score.js';
import type { ScoreTargetId } from '../score/score.js';

/**
 * `rca-bench` command-line argument parser.
 *
 * This module is deliberately IO-free: it turns an `argv` array into a typed
 * command object, or an error string. File IO and command orchestration live in
 * the executable entrypoint, which makes this parser a pure, fully-testable
 * function.
 */

export const CLI_VERSION = '0.1.0';

export type ExportTarget = 'openrca-1.0' | 'openrca-2.0' | 'rcaeval' | 'rca100' | 'aiops2025' | 'cloud-opsbench' | 'itbench';

export type EvolveAction = 'propose' | 'approve' | 'reject' | 'stale';

export type CliCommand =
  | { command: 'help'; topic?: string }
  | { command: 'version' }
  | {
      command: 'source';
      path: string;
      output?: string;
      format?: FileFormat;
      signalKind?: FileSignalKind;
      layout?: string;
      serviceName?: string;
      timeLayout?: TimeLayout;
      assumeOffsetMinutes?: number;
      hasHeader?: boolean;
      delimiter?: string;
    }
  | { command: 'export'; target: ExportTarget; suite?: RcaEvalSuite; input: string; outDir: string }
  | {
      command: 'ingest';
      source: string;
      target: PrimeDatasetId;
      cases: string;
      system?: string;
      output?: string;
      entities?: Entity[];
      edges?: EntityEdge[];
      leadMs?: number;
      lagMs?: number;
    }
  | { command: 'score'; target: ScoreTargetId; anchors?: string; dir: string }
  | { command: 'official'; mode: 'bundle'; input: string; allowEmptyReason?: string; output?: string }
  | {
      command: 'official';
      mode: 'dir';
      target: ScoreTargetId;
      dir: string;
      allowEmptyReason?: string;
      output?: string;
    }
  | { command: 'transform'; input: string; rules: string; output?: string; idField?: string }
  | { command: 'gate'; input: string; target: ScoreTargetId; gateRunId?: string }
  | { command: 'case'; input: string; output?: string }
  | { command: 'report'; input: string; title?: string; target?: ScoreTargetId; output?: string }
  | { command: 'pack'; input: string; output: string; prefix?: string }
  | { command: 'evolve'; action: 'propose'; input: string; output?: string }
  | { command: 'evolve'; action: 'approve'; input: string; note?: string; output?: string }
  | { command: 'evolve'; action: 'reject'; input: string; note?: string; output?: string }
  | { command: 'evolve'; action: 'stale'; input: string; cases: string };

export type CliParseResult = { ok: true; command: CliCommand } | { ok: false; error: string };

const FILE_FORMATS: readonly string[] = ['csv', 'tsv', 'jsonl', 'json'];
const SIGNAL_KINDS: readonly string[] = ['metric', 'log', 'trace'];
const TIME_LAYOUTS: readonly string[] = ['iso8601', 'rfc3339', 'unix_s', 'unix_ms', 'unix_us', 'unix_ns', 'java_log'];
const EXPORT_TARGETS: readonly string[] = ['openrca-1.0', 'openrca-2.0', 'rcaeval', 'rca100', 'aiops2025', 'cloud-opsbench', 'itbench'];
const SUITES: readonly string[] = ['RE1', 'RE2', 'RE3'];
const SCORE_TARGETS: readonly string[] = SCORE_TARGET_IDS;
const EVOLVE_ACTIONS: readonly string[] = ['propose', 'approve', 'reject', 'stale'];

function isOneOf(value: string, allowed: readonly string[]): boolean {
  return allowed.includes(value);
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

type ParsedValues = Record<string, string | boolean | undefined>;

/**
 * One flag, described once.
 *
 * `help` and `parse` are read by two different consumers: `formatCommandHelp`
 * renders the first, `parseFlags` enforces the second. Keeping them in a single
 * record per flag is what stops the reference from advertising an option the
 * parser rejects -- the exact defect this table was introduced to close.
 *
 * The placeholder is required for a value flag and forbidden for a boolean one,
 * so "render a placeholder" is a type-level fact rather than a runtime check.
 * A boolean that advertised `--has-header <value>` would be a lie the compiler
 * now refuses to let anyone write.
 */
type FlagSpec =
  | { type: 'string'; placeholder: string; required?: boolean; help: string }
  | { type: 'boolean'; placeholder?: never; required?: boolean; help: string };

/** A command's usage line plus its flag set, in help-text order. */
interface CommandSpec {
  /** The invocation shown under `Usage:`. */
  usage: string;
  description: string;
  flags: Record<string, FlagSpec>;
}

/**
 * The single source of truth for every command's flags.
 *
 * `parse*` functions below read their option maps from here rather than
 * restating them, and `formatCommandHelp` renders the same records. The
 * drift guard in the test suite walks both directions -- every advertised flag
 * must parse, and every parsed flag must be advertised -- so a flag cannot be
 * added to one side alone.
 */
const COMMAND_SPECS = {
  source: {
    usage: 'rca-bench source --path <path> [options]',
    description: 'Ingest a flat file (csv, tsv, jsonl or json) into IR signals.',
    flags: {
      path: { placeholder: '<path>', type: 'string', required: true, help: 'File to read' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the signals to a file instead of stdout' },
      format: { placeholder: `<${FILE_FORMATS.join('|')}>`, type: 'string', help: 'Override the detected file format' },
      'signal-kind': { placeholder: `<${SIGNAL_KINDS.join('|')}>`, type: 'string', help: 'Override the detected signal kind' },
      layout: { placeholder: '<json>', type: 'string', help: 'Column mapping as inline JSON' },
      'service-name': { placeholder: '<name>', type: 'string', help: 'Fallback service.name when the file has no service column' },
      'time-layout': { placeholder: `<${TIME_LAYOUTS.join('|')}>`, type: 'string', help: 'Override the detected timestamp layout' },
      'assume-offset-minutes': { placeholder: '<minutes>', type: 'string', help: 'Offset applied when the timestamp carries no zone' },
      'has-header': { type: 'boolean', help: 'Treat the first line as a header row' },
      delimiter: { placeholder: '<char>', type: 'string', help: 'Delimiter for delimited files' },
    },
  },
  ingest: {
    usage: 'rca-bench ingest --source <dir> --target <dataset> --cases <file> [options]',
    description: 'Ingest a prime-dataset slice into an IR bundle.',
    flags: {
      source: { placeholder: '<dir>', type: 'string', required: true, help: 'Directory holding the dataset slice' },
      target: { placeholder: `<${PRIME_DATASET_IDS.join('|')}>`, type: 'string', required: true, help: 'Prime dataset identifier' },
      cases: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the case descriptors' },
      system: { placeholder: '<name>', type: 'string', help: 'Entity namespace; defaults to the target id' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the bundle to a file instead of stdout' },
      entities: {
        placeholder: '<json>',
        type: 'string',
        help: 'Extra entities as inline JSON, for a root cause the telemetry does not carry',
      },
      edges: { placeholder: '<json>', type: 'string', help: 'Extra topology edges as inline JSON' },
      'lead-ms': { placeholder: '<ms>', type: 'string', help: 'Context before the injection time; defaults to 600000' },
      'lag-ms': { placeholder: '<ms>', type: 'string', help: 'Context after the injection time; defaults to the lead' },
    },
  },
  transform: {
    usage: 'rca-bench transform --input <file> --rules <file> [options]',
    description: 'Apply transform rules to source records.',
    flags: {
      input: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the source records' },
      rules: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the transform rules' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the result to a file instead of stdout' },
      'id-field': { placeholder: '<field>', type: 'string', help: 'Record field holding the stable id' },
    },
  },
  case: {
    usage: 'rca-bench case --input <file> [options]',
    description: 'Assemble an IR bundle from a case draft.',
    flags: {
      input: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the case draft' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the bundle to a file instead of stdout' },
    },
  },
  gate: {
    usage: 'rca-bench gate --input <file> --target <target> [options]',
    description: 'Run the G1-G5 quality gates on an IR bundle.',
    flags: {
      input: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the IR bundle' },
      target: { placeholder: '<target>', type: 'string', required: true, help: 'Score target the bundle is destined for' },
      'gate-run-id': { placeholder: '<id>', type: 'string', help: 'Identifier recorded on the gate run' },
    },
  },
  export: {
    usage: 'rca-bench export --target <target> --input <file> --out-dir <dir> [options]',
    description: 'Export an IR bundle to a target benchmark format.',
    flags: {
      target: { placeholder: `<${EXPORT_TARGETS.join('|')}>`, type: 'string', required: true, help: 'Benchmark format to write' },
      suite: { placeholder: `<${SUITES.join('|')}>`, type: 'string', help: 'Suite selector for the rcaeval target' },
      input: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the IR bundle' },
      'out-dir': { placeholder: '<dir>', type: 'string', required: true, help: 'Directory to write the exported files into' },
    },
  },
  score: {
    usage: 'rca-bench score --target <target> --dir <dir> [options]',
    description: 'Verify an exported dataset against a target contract.',
    flags: {
      target: { placeholder: `<${SCORE_TARGETS.join('|')}>`, type: 'string', required: true, help: 'Target contract to score against' },
      anchors: { placeholder: '<json>', type: 'string', help: 'Returned-file SHA-256 anchors as inline JSON' },
      dir: { placeholder: '<dir>', type: 'string', required: true, help: 'Directory holding the exported files' },
    },
  },
  official: {
    usage: 'rca-bench official (--input <file> | --target <target> --dir <dir>) [options]',
    description: 'Run the official-metric oracle and mutation regression.',
    flags: {
      input: { placeholder: '<file>', type: 'string', help: 'IR bundle to score directly' },
      target: { placeholder: `<${SCORE_TARGETS.join('|')}>`, type: 'string', help: 'Target contract when scoring a directory' },
      dir: { placeholder: '<dir>', type: 'string', help: 'Exported directory paired with --target' },
      'allow-empty-reason': { placeholder: '<reason>', type: 'string', help: 'Permit an empty result and record why' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the report to a file instead of stdout' },
    },
  },
  report: {
    usage: 'rca-bench report --input <file> [options]',
    description: 'Render coverage, gates and score into an HTML report.',
    flags: {
      input: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the report input' },
      title: { placeholder: '<text>', type: 'string', help: 'Report title' },
      target: { placeholder: `<${SCORE_TARGETS.join('|')}>`, type: 'string', help: 'Target contract to include in the report' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the HTML to a file instead of stdout' },
    },
  },
  pack: {
    usage: 'rca-bench pack --input <dir> --output <file> [options]',
    description: 'Pack a directory into a reproducible tar.gz with a manifest.',
    flags: {
      input: { placeholder: '<dir>', type: 'string', required: true, help: 'Directory to pack' },
      output: { placeholder: '<file>', type: 'string', required: true, help: 'Archive path to write' },
      prefix: { placeholder: '<path>', type: 'string', help: 'Path prefix recorded inside the archive' },
    },
  },
  evolve: {
    usage: 'rca-bench evolve <propose|approve|reject|stale> [options]',
    description: 'Propose, approve, reject or roll back an evolution.',
    flags: {
      input: { placeholder: '<file>', type: 'string', required: true, help: 'JSON file holding the evolution input' },
      output: { placeholder: '<file>', type: 'string', help: 'Write the result to a file instead of stdout' },
      note: { placeholder: '<text>', type: 'string', help: 'Reviewer note recorded on approve or reject' },
      cases: { placeholder: '<json>', type: 'string', help: 'Case list as inline JSON, used to compute staleness' },
    },
  },
} as const satisfies Record<string, CommandSpec>;

/** Command names that own a `COMMAND_SPECS` entry, in help-text order. */
export const HELP_TOPICS: readonly string[] = [
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

function isHelpTopic(value: string): boolean {
  return isOneOf(value, HELP_TOPICS);
}

/**
 * Turn a spec's flag records into the option map `parseArgs` expects.
 *
 * Derived rather than restated so the parser and the reference cannot disagree
 * about which flags exist; only the per-flag `type` is carried across.
 */
function flagOptions(topic: Exclude<keyof typeof COMMAND_SPECS, 'evolve'>): ParseArgsConfig['options'] {
  const options: NonNullable<ParseArgsConfig['options']> = {};
  for (const [name, spec] of Object.entries(COMMAND_SPECS[topic].flags)) {
    options[name] = { type: spec.type };
  }
  return options;
}

/**
 * Flag sets for the four `evolve` actions.
 *
 * The union of the `evolve` spec's flags is deliberately *not* the per-action
 * set: `--note` is meaningless on `propose`, and `--cases` belongs only to
 * `stale`. Restating the subsets here keeps each action rejecting an option
 * that would otherwise be silently ignored -- a silently ignored flag is a
 * configuration the caller believes took effect but did not.
 */
const EVOLVE_ACTION_FLAGS = {
  propose: ['input', 'output'],
  approve: ['input', 'note', 'output'],
  reject: ['input', 'note', 'output'],
  stale: ['input', 'cases'],
} as const satisfies Record<EvolveAction, readonly (keyof (typeof COMMAND_SPECS)['evolve']['flags'])[]>;

function evolveFlagOptions(action: EvolveAction): ParseArgsConfig['options'] {
  const options: NonNullable<ParseArgsConfig['options']> = {};
  const all = COMMAND_SPECS.evolve.flags;
  for (const name of EVOLVE_ACTION_FLAGS[action]) {
    options[name] = { type: all[name].type };
  }
  return options;
}

function parseFlags(args: string[], options: ParseArgsConfig['options']): { values: ParsedValues } | { error: string } {  try {
    const { values } = nodeParseArgs({
      args,
      options,
      strict: true,
      allowPositionals: false,
    });
    return { values: values as ParsedValues };
  } catch (e) {
    // `parseArgs` throws `Error` instances exclusively (e.g. unknown option).
    return { error: (e as Error).message };
  }
}

function parseSource(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('source'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const path = v.path;
  if (typeof path !== 'string' || path === '') {
    return { ok: false, error: 'source requires --path <path>' };
  }

  if (v.format !== undefined && !isOneOf(String(v.format), FILE_FORMATS)) {
    return { ok: false, error: `invalid --format '${v.format}' (expected ${FILE_FORMATS.join('|')})` };
  }
  if (v['signal-kind'] !== undefined && !isOneOf(String(v['signal-kind']), SIGNAL_KINDS)) {
    return { ok: false, error: `invalid --signal-kind '${v['signal-kind']}' (expected ${SIGNAL_KINDS.join('|')})` };
  }
  if (v['time-layout'] !== undefined && !isOneOf(String(v['time-layout']), TIME_LAYOUTS)) {
    return { ok: false, error: `invalid --time-layout '${v['time-layout']}' (expected ${TIME_LAYOUTS.join('|')})` };
  }
  if (v.layout !== undefined && !isJson(String(v.layout))) {
    return { ok: false, error: 'invalid --layout JSON' };
  }

  let assumeOffsetMinutes: number | undefined;
  if (v['assume-offset-minutes'] !== undefined) {
    const n = Number(v['assume-offset-minutes']);
    if (!Number.isFinite(n)) {
      return { ok: false, error: `invalid --assume-offset-minutes '${v['assume-offset-minutes']}'` };
    }
    assumeOffsetMinutes = n;
  }

  return {
    ok: true,
    command: {
      command: 'source',
      path,
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
      ...(v.format !== undefined ? { format: v.format as FileFormat } : {}),
      ...(v['signal-kind'] !== undefined ? { signalKind: v['signal-kind'] as FileSignalKind } : {}),
      ...(v.layout !== undefined ? { layout: String(v.layout) } : {}),
      ...(v['service-name'] !== undefined ? { serviceName: String(v['service-name']) } : {}),
      ...(v['time-layout'] !== undefined ? { timeLayout: v['time-layout'] as TimeLayout } : {}),
      ...(assumeOffsetMinutes !== undefined ? { assumeOffsetMinutes } : {}),
      ...(v['has-header'] !== undefined ? { hasHeader: Boolean(v['has-header']) } : {}),
      ...(v.delimiter !== undefined ? { delimiter: String(v.delimiter) } : {}),
    },
  };
}

function parseExport(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('export'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const target = v.target;
  if (typeof target !== 'string' || target === '') {
    return { ok: false, error: 'export requires --target <openrca-1.0|openrca-2.0|rcaeval|rca100|aiops2025|cloud-opsbench|itbench>' };
  }
  if (!isOneOf(target, EXPORT_TARGETS)) {
    return { ok: false, error: `invalid --target '${target}' (expected ${EXPORT_TARGETS.join('|')})` };
  }

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'export requires --input <bundle.json>' };
  }
  const outDir = v['out-dir'];
  if (typeof outDir !== 'string' || outDir === '') {
    return { ok: false, error: 'export requires --out-dir <dir>' };
  }

  let suite: RcaEvalSuite | undefined;
  if (v.suite !== undefined) {
    const upper = String(v.suite).toUpperCase();
    if (!isOneOf(upper, SUITES)) {
      return { ok: false, error: `invalid --suite '${v.suite}' (expected ${SUITES.join('|')})` };
    }
    suite = upper as RcaEvalSuite;
  }

  return {
    ok: true,
    command: { command: 'export', target: target as ExportTarget, input, outDir, ...(suite !== undefined ? { suite } : {}) },
  };
}

function parseScore(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('score'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const target = v.target;
  if (typeof target !== 'string' || target === '') {
    return { ok: false, error: 'score requires --target <target>' };
  }
  if (!isOneOf(target, SCORE_TARGETS)) {
    return { ok: false, error: `invalid --target '${target}' (expected ${SCORE_TARGETS.join('|')})` };
  }
  const dir = v.dir;
  if (typeof dir !== 'string' || dir === '') {
    return { ok: false, error: 'score requires --dir <exported-dir>' };
  }
  if (v.anchors !== undefined && !isJson(String(v.anchors))) {
    return { ok: false, error: 'invalid --anchors JSON' };
  }

  return {
    ok: true,
    command: {
      command: 'score',
      target: target as ScoreTargetId,
      dir,
      ...(v.anchors !== undefined ? { anchors: String(v.anchors) } : {}),
    },
  };
}

/**
 * Parse the `official` command.
 *
 * Two disjoint modes, because they answer different questions:
 *
 *  - `--input <bundle.json>` exports the bundle for every score target and runs
 *    the whole official-metric regression grid (the end-to-end guarantee).
 *  - `--target <t> --dir <dir>` runs one target against an already exported
 *    directory, so a dataset produced elsewhere can still be verified.
 *
 * Mixing them is rejected: silently ignoring half the flags would make the
 * output mean something the user did not ask for.
 */
function parseOfficial(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('official'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  if (v.target !== undefined && !isOneOf(String(v.target), SCORE_TARGETS)) {
    return { ok: false, error: `invalid --target '${v.target}' (expected ${SCORE_TARGETS.join('|')})` };
  }
  if (v.input !== undefined && (typeof v.input !== 'string' || v.input === '')) {
    return { ok: false, error: 'invalid --input <bundle.json>' };
  }
  if (v.dir !== undefined && (typeof v.dir !== 'string' || v.dir === '')) {
    return { ok: false, error: 'invalid --dir <exported-dir>' };
  }
  if (v['allow-empty-reason'] !== undefined && (typeof v['allow-empty-reason'] !== 'string' || v['allow-empty-reason'] === '')) {
    return { ok: false, error: 'invalid --allow-empty-reason <text>' };
  }

  const input = v.input as string | undefined;
  const target = v.target as ScoreTargetId | undefined;
  const dir = v.dir as string | undefined;

  const shared = {
    ...(v['allow-empty-reason'] !== undefined ? { allowEmptyReason: String(v['allow-empty-reason']) } : {}),
    ...(v.output !== undefined ? { output: String(v.output) } : {}),
  };

  if (input !== undefined) {
    if (target !== undefined || dir !== undefined) {
      return { ok: false, error: 'official accepts either --input <bundle.json> or --target with --dir, not both' };
    }
    return { ok: true, command: { command: 'official', mode: 'bundle', input, ...shared } };
  }
  if (target === undefined) {
    return { ok: false, error: 'official requires either --input <bundle.json> or --target <target> --dir <exported-dir>' };
  }
  if (dir === undefined) {
    return { ok: false, error: 'official requires --dir <exported-dir> when --target is given' };
  }
  return { ok: true, command: { command: 'official', mode: 'dir', target, dir, ...shared } };
}

function parseTransform(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('transform'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'transform requires --input <source.json>' };
  }
  const rules = v.rules;
  if (typeof rules !== 'string' || rules === '') {
    return { ok: false, error: 'transform requires --rules <rules.json>' };
  }

  return {
    ok: true,
    command: {
      command: 'transform',
      input,
      rules,
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
      ...(v['id-field'] !== undefined ? { idField: String(v['id-field']) } : {}),
    },
  };
}

function parseGate(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('gate'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'gate requires --input <bundle.json>' };
  }
  const target = v.target;
  if (typeof target !== 'string' || target === '') {
    return { ok: false, error: 'gate requires --target <target>' };
  }
  if (!isOneOf(target, SCORE_TARGETS)) {
    return { ok: false, error: `invalid --target '${target}' (expected ${SCORE_TARGETS.join('|')})` };
  }

  return {
    ok: true,
    command: {
      command: 'gate',
      input,
      target: target as ScoreTargetId,
      ...(v['gate-run-id'] !== undefined ? { gateRunId: String(v['gate-run-id']) } : {}),
    },
  };
}

function parseCase(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('case'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'case requires --input <draft.json>' };
  }

  return {
    ok: true,
    command: {
      command: 'case',
      input,
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
    },
  };
}

function parseReport(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('report'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'report requires --input <bundle.json>' };
  }
  if (v.target !== undefined && !isOneOf(String(v.target), SCORE_TARGETS)) {
    return { ok: false, error: `invalid --target '${v.target}' (expected ${SCORE_TARGETS.join('|')})` };
  }

  return {
    ok: true,
    command: {
      command: 'report',
      input,
      ...(v.title !== undefined ? { title: String(v.title) } : {}),
      ...(v.target !== undefined ? { target: String(v.target) as ScoreTargetId } : {}),
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
    },
  };
}

function parseEvolvePropose(args: string[]): CliParseResult {
  const parsed = parseFlags(args, evolveFlagOptions('propose'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'evolve propose requires --input <draft.json>' };
  }

  return {
    ok: true,
    command: {
      command: 'evolve',
      action: 'propose',
      input,
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
    },
  };
}

function parseEvolveApprove(args: string[]): CliParseResult {
  const parsed = parseFlags(args, evolveFlagOptions('approve'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'evolve approve requires --input <proposal.json>' };
  }

  return {
    ok: true,
    command: {
      command: 'evolve',
      action: 'approve',
      input,
      ...(v.note !== undefined ? { note: String(v.note) } : {}),
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
    },
  };
}

function parseEvolveReject(args: string[]): CliParseResult {
  const parsed = parseFlags(args, evolveFlagOptions('reject'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'evolve reject requires --input <proposal.json>' };
  }

  return {
    ok: true,
    command: {
      command: 'evolve',
      action: 'reject',
      input,
      ...(v.note !== undefined ? { note: String(v.note) } : {}),
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
    },
  };
}

function parseEvolveStale(args: string[]): CliParseResult {
  const parsed = parseFlags(args, evolveFlagOptions('stale'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'evolve stale requires --input <proposal.json>' };
  }
  const cases = v.cases;
  if (typeof cases !== 'string' || cases === '') {
    return { ok: false, error: 'evolve stale requires --cases <json-array>' };
  }
  if (!isJson(cases)) {
    return { ok: false, error: 'invalid --cases JSON' };
  }

  return {
    ok: true,
    command: { command: 'evolve', action: 'stale', input, cases },
  };
}

function parsePack(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('pack'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = v.input;
  if (typeof input !== 'string' || input === '') {
    return { ok: false, error: 'pack requires --input <dir>' };
  }
  const output = v.output;
  if (typeof output !== 'string' || output === '') {
    return { ok: false, error: 'pack requires --output <file.tar.gz>' };
  }
  const prefix = v.prefix;
  if (prefix !== undefined && (typeof prefix !== 'string' || prefix === '')) {
    return { ok: false, error: 'invalid --prefix <name>' };
  }

  return {
    ok: true,
    command: {
      command: 'pack',
      input,
      output,
      ...(prefix !== undefined ? { prefix: String(prefix) } : {}),
    },
  };
}

/** Parse the `evolve` subcommand family (`propose|approve|reject|stale`). */
function parseEvolve(args: string[]): CliParseResult {
  const [action, ...rest] = args;
  if (action === undefined) {
    return { ok: false, error: 'evolve requires an action (propose|approve|reject|stale)' };
  }
  if (!isOneOf(action, EVOLVE_ACTIONS)) {
    return { ok: false, error: `unknown evolve action '${action}' (expected ${EVOLVE_ACTIONS.join('|')})` };
  }
  switch (action) {
    case 'propose':
      return parseEvolvePropose(rest);
    case 'approve':
      return parseEvolveApprove(rest);
    case 'reject':
      return parseEvolveReject(rest);
    default:
      return parseEvolveStale(rest);
  }
}

/** Parse an `argv` array into a typed command object, or an error string. */
export function parseCliArgs(argv: string[]): CliParseResult {
  if (argv.length === 0) {
    return { ok: true, command: { command: 'help' } };
  }

  const [head, ...rest] = argv;
  // `argv.length === 0` returned above, so `head` is always present; the
  // assertion records that rather than adding a branch no input can reach.
  const command = head as string;
  if (command === '--help' || command === '-h' || command === 'help') {
    // `help <command>` names a topic too, so both spellings work. An unknown
    // topic is reported as such rather than silently downgraded to top-level
    // help, which would answer a question nobody asked.
    const topic = rest[0];
    if (topic === undefined) return { ok: true, command: { command: 'help' } };
    if (!isHelpTopic(topic)) return { ok: false, error: `unknown command '${topic}'` };
    return { ok: true, command: { command: 'help', topic } };
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    return { ok: true, command: { command: 'version' } };
  }

  // Help for a named command. Placement matters: this runs only after the
  // command name has been recognised, so `frobnicate --help` still fails as an
  // unknown command. `formatHelp` has advertised this flag since the first
  // release; intercepting here is what finally makes the promise true.
  if ((rest[0] === '--help' || rest[0] === '-h') && isHelpTopic(command)) {
    return { ok: true, command: { command: 'help', topic: command } };
  }

  switch (command) {
    case 'source':
      return parseSource(rest);
    case 'export':
      return parseExport(rest);
    case 'ingest':
      return parseIngest(rest);
    case 'score':
      return parseScore(rest);
    case 'official':
      return parseOfficial(rest);
    case 'transform':
      return parseTransform(rest);
    case 'gate':
      return parseGate(rest);
    case 'case':
      return parseCase(rest);
    case 'report':
      return parseReport(rest);
    case 'pack':
      return parsePack(rest);
    case 'evolve':
      return parseEvolve(rest);
    default:
      return { ok: false, error: `unknown command '${command}' (expected ${HELP_TOPICS.join('|')}|help|version)` };
  }
}

/**
 * `ingest` turns a prime-dataset slice into an IR bundle.
 *
 * `--cases` is a JSON file holding the case descriptors. The labels they carry
 * (component, fault type, injection time) come from the official dataset, which
 * is exactly why they are an input rather than something we infer: a guessed
 * label would make the round-trip reproduction score against itself.
 *
 * `--entities` and `--edges` are inline JSON rather than file paths, matching
 * the convention `--layout` and `--anchors` already set. They exist because a
 * root cause is not always observable in the telemetry slice: a component that
 * failed before the window opened never appears in `service.name`, and without
 * a way to declare it the case is unresolvable. `--lead-ms` / `--lag-ms`
 * expose the observation window, which was previously fixed at its default.
 */
function parseIngest(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('ingest'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const source = v.source;
  if (typeof source !== 'string' || source === '') {
    return { ok: false, error: 'ingest requires --source <dir>' };
  }
  const target = v.target;
  if (typeof target !== 'string' || !isOneOf(target, PRIME_DATASET_IDS as readonly string[])) {
    return {
      ok: false,
      error: `ingest requires --target <${PRIME_DATASET_IDS.join('|')}>`,
    };
  }
  const cases = v.cases;
  if (typeof cases !== 'string' || cases === '') {
    return { ok: false, error: 'ingest requires --cases <cases.json>' };
  }
  const system = v.system;
  if (system !== undefined && (typeof system !== 'string' || system.trim() === '')) {
    return { ok: false, error: 'invalid --system <name>' };
  }

  // `entityGraphSchema` is the same contract the IR itself is validated
  // against, so a malformed entry fails here with a clear flag name rather
  // than deep inside the ingest with a schema path. `entitySchema` is required
  // to produce a non-empty result: an empty declaration is a configuration
  // mistake, not a no-op worth honouring.
  let entities: Entity[] | undefined;
  if (v.entities !== undefined) {
    const parsedEntities = parseEntityList(String(v.entities), '--entities');
    if ('error' in parsedEntities) return { ok: false, error: parsedEntities.error };
    entities = parsedEntities.value;
  }
  let edges: EntityEdge[] | undefined;
  if (v.edges !== undefined) {
    const parsedEdges = parseEdgeList(String(v.edges), '--edges');
    if ('error' in parsedEdges) return { ok: false, error: parsedEdges.error };
    edges = parsedEdges.value;
  }

  const leadMs = parseWindow('lead-ms', v['lead-ms']);
  if (typeof leadMs === 'object') return { ok: false, error: leadMs.error };
  const lagMs = parseWindow('lag-ms', v['lag-ms']);
  if (typeof lagMs === 'object') return { ok: false, error: lagMs.error };

  return {
    ok: true,
    command: {
      command: 'ingest',
      source,
      target: target as PrimeDatasetId,
      cases,
      ...(system !== undefined ? { system: String(system) } : {}),
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
      ...(entities !== undefined ? { entities } : {}),
      ...(edges !== undefined ? { edges } : {}),
      ...(leadMs !== undefined ? { leadMs } : {}),
      ...(lagMs !== undefined ? { lagMs } : {}),
    },
  };
}

/**
 * Parse one of the inline-JSON entity flags.
 *
 * Returning a discriminated result rather than throwing keeps the caller's
 * error path uniform with the rest of this module, and names the flag in the
 * message so the operator knows which of several JSON arguments was wrong.
 */
function parseEntityList(raw: string, flag: string): { value: Entity[] } | { error: string } {
  const parsed = parseJsonValue(raw, flag);
  if ('error' in parsed) return parsed;
  const result = entityGraphSchema.shape.entities.safeParse(parsed.value);
  if (!result.success || result.data.length === 0) return { error: `invalid ${flag} JSON` };
  return { value: result.data };
}

function parseEdgeList(raw: string, flag: string): { value: EntityEdge[] } | { error: string } {
  const parsed = parseJsonValue(raw, flag);
  if ('error' in parsed) return parsed;
  const result = entityGraphSchema.shape.edges.safeParse(parsed.value);
  if (!result.success || result.data.length === 0) return { error: `invalid ${flag} JSON` };
  return { value: result.data };
}

function parseJsonValue(raw: string, flag: string): { value: unknown } | { error: string } {
  if (!isJson(raw)) return { error: `invalid ${flag} JSON` };
  return { value: JSON.parse(raw) as unknown };
}

/**
 * Parse a millisecond window flag.
 *
 * Non-negative integers only. A negative window has no coherent meaning, and a
 * fractional one is almost always a unit error -- seconds typed where
 * milliseconds were expected -- so both are rejected rather than quietly
 * rounded into something the caller did not ask for.
 */
function parseWindow(flag: string, raw: ParsedValues[string]): number | undefined | { error: string } {
  if (raw === undefined) return undefined;
  const text = String(raw);
  if (!/^\d+$/.test(text)) return { error: `invalid --${flag} '${text}'` };
  return Number(text);
}

/** Human-readable usage text for the whole CLI. */
export function formatHelp(): string {
  return [
    'rca-bench - turn enterprise telemetry into RCA benchmark field contracts',
    '',
    'Usage:',
    '  rca-bench <command> [options]',
    '',
    'Commands:',
    '  source     Ingest a flat file into IR signals',
    '  ingest     Ingest a prime dataset slice into an IR bundle',
    '  transform  Apply transform rules to source records',
    '  case       Assemble an IR bundle from a case draft',
    '  gate       Run the G1-G5 quality gates on an IR bundle',
    '  export     Export an IR bundle to a target benchmark format',
    '  score      Verify an exported dataset against a target contract',
    '  official   Run the official-metric oracle and mutation regression',
    '  report     Render coverage, gates and score into an HTML report',
    '  pack       Pack a directory into a reproducible tar.gz with a manifest',
    '  evolve     Propose, approve, reject or roll back an evolution',
    '  help       Show this help text',
    '  version    Print the version',
    '',
    'Run `rca-bench <command> --help` for command-specific options.',
  ].join('\n');
}

/**
 * Human-readable reference for one command.
 *
 * Rendered from `COMMAND_SPECS`, the same table the parsers read their option
 * maps from, so the reference cannot advertise a flag the parser rejects. This
 * is the fix for the defect where `--help` was promised on every subcommand but
 * accepted by none of them.
 */
export function formatCommandHelp(topic: string): string {
  if (!isHelpTopic(topic)) {
    return `unknown command '${topic}' (expected ${HELP_TOPICS.join('|')})`;
  }
  const spec = COMMAND_SPECS[topic as Exclude<keyof typeof COMMAND_SPECS, 'evolve'>] as CommandSpec;
  const lines = [
    `rca-bench ${topic} - ${spec.description}`,
    '',
    'Usage:',
    `  ${spec.usage}`,
    '',
    'Options:',
  ];
  for (const [name, flag] of Object.entries(spec.flags)) {
    // Only a value flag carries a placeholder; `FlagSpec` makes that a type
    // guarantee, so there is no fallback to render when one is absent.
    const placeholder = flag.type === 'boolean' ? '' : ` ${flag.placeholder}`;
    const suffix = flag.required === true ? ' (required)' : '';
    lines.push(`  --${name}${placeholder}${suffix}`);
    lines.push(`      ${flag.help}`);
  }
  lines.push('', 'Run `rca-bench --help` for the list of commands.');
  return lines.join('\n');
}

/** Semantic-version string. */
export function formatVersion(): string {
  return CLI_VERSION;
}
