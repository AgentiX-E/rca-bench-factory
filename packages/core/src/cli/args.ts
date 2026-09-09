import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import type { FileFormat, FileSignalKind } from '../ingest/file.js';
import type { TimeLayout } from '../util/time.js';
import type { RcaEvalSuite } from '../export/rcaeval.js';
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

export type ExportTarget = 'openrca-1.0' | 'rcaeval' | 'rca100' | 'aiops2025';

export type CliCommand =
  | { command: 'help' }
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
  | { command: 'score'; target: ScoreTargetId; anchors?: string; dir: string }
  | { command: 'transform'; input: string; rules: string; output?: string; idField?: string }
  | { command: 'gate'; input: string; target: ScoreTargetId; gateRunId?: string }
  | { command: 'case'; input: string; output?: string };

export type CliParseResult = { ok: true; command: CliCommand } | { ok: false; error: string };

const FILE_FORMATS: readonly string[] = ['csv', 'tsv', 'jsonl', 'json'];
const SIGNAL_KINDS: readonly string[] = ['metric', 'log', 'trace'];
const TIME_LAYOUTS: readonly string[] = ['iso8601', 'rfc3339', 'unix_s', 'unix_ms', 'unix_us', 'unix_ns', 'java_log'];
const EXPORT_TARGETS: readonly string[] = ['openrca-1.0', 'rcaeval', 'rca100', 'aiops2025'];
const SUITES: readonly string[] = ['RE1', 'RE2', 'RE3'];
const SCORE_TARGETS: readonly string[] = ['openrca-1.0', 'rcaeval-re1', 'rcaeval-re2', 'rcaeval-re3', 'rca100', 'aiops2025'];

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

function parseFlags(args: string[], options: ParseArgsConfig['options']): { values: ParsedValues } | { error: string } {
  try {
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
  const parsed = parseFlags(args, {
    path: { type: 'string' },
    output: { type: 'string' },
    format: { type: 'string' },
    'signal-kind': { type: 'string' },
    layout: { type: 'string' },
    'service-name': { type: 'string' },
    'time-layout': { type: 'string' },
    'assume-offset-minutes': { type: 'string' },
    'has-header': { type: 'boolean' },
    delimiter: { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    target: { type: 'string' },
    suite: { type: 'string' },
    input: { type: 'string' },
    'out-dir': { type: 'string' },
  });
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const target = v.target;
  if (typeof target !== 'string' || target === '') {
    return { ok: false, error: 'export requires --target <openrca-1.0|rcaeval|rca100|aiops2025>' };
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
  const parsed = parseFlags(args, {
    target: { type: 'string' },
    anchors: { type: 'string' },
    dir: { type: 'string' },
  });
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

function parseTransform(args: string[]): CliParseResult {
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    rules: { type: 'string' },
    output: { type: 'string' },
    'id-field': { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    target: { type: 'string' },
    'gate-run-id': { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    output: { type: 'string' },
  });
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

/** Parse an `argv` array into a typed command object, or an error string. */
export function parseCliArgs(argv: string[]): CliParseResult {
  if (argv.length === 0) {
    return { ok: true, command: { command: 'help' } };
  }

  const [head, ...rest] = argv;
  if (head === '--help' || head === '-h' || head === 'help') {
    return { ok: true, command: { command: 'help' } };
  }
  if (head === '--version' || head === '-v' || head === 'version') {
    return { ok: true, command: { command: 'version' } };
  }

  switch (head) {
    case 'source':
      return parseSource(rest);
    case 'export':
      return parseExport(rest);
    case 'score':
      return parseScore(rest);
    case 'transform':
      return parseTransform(rest);
    case 'gate':
      return parseGate(rest);
    case 'case':
      return parseCase(rest);
    default:
      return { ok: false, error: `unknown command '${head}' (expected source|transform|gate|case|export|score|help|version)` };
  }
}

/** Human-readable usage text. */
export function formatHelp(): string {
  return [
    'rca-bench - turn enterprise telemetry into RCA benchmark field contracts',
    '',
    'Usage:',
    '  rca-bench <command> [options]',
    '',
    'Commands:',
    '  source     Ingest a flat file into IR signals',
    '  transform  Apply transform rules to source records',
    '  case       Assemble an IR bundle from a case draft',
    '  gate       Run the G1-G5 quality gates on an IR bundle',
    '  export     Export an IR bundle to a target benchmark format',
    '  score      Verify an exported dataset against a target contract',
    '  help       Show this help text',
    '  version    Print the version',
    '',
    'Run `rca-bench <command> --help` for command-specific options.',
  ].join('\n');
}

/** Semantic-version string. */
export function formatVersion(): string {
  return CLI_VERSION;
}
