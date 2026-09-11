import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import type { FileFormat, FileSignalKind } from '../ingest/file.js';
import { PRIME_DATASET_IDS, type PrimeDatasetId } from '../ingest/prime.js';
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
  | {
      command: 'ingest';
      source: string;
      target: PrimeDatasetId;
      cases: string;
      system?: string;
      output?: string;
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    target: { type: 'string' },
    dir: { type: 'string' },
    'allow-empty-reason': { type: 'string' },
    output: { type: 'string' },
  });
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

function parseReport(args: string[]): CliParseResult {
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    title: { type: 'string' },
    target: { type: 'string' },
    output: { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    output: { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    note: { type: 'string' },
    output: { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    note: { type: 'string' },
    output: { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    cases: { type: 'string' },
  });
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
  const parsed = parseFlags(args, {
    input: { type: 'string' },
    output: { type: 'string' },
    prefix: { type: 'string' },
  });
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
      return { ok: false, error: `unknown command '${head}' (expected source|transform|gate|case|ingest|export|score|official|report|pack|evolve|help|version)` };
  }
}

/**
 * `ingest` turns a prime-dataset slice into an IR bundle.
 *
 * `--cases` is a JSON file holding the case descriptors. The labels they carry
 * (component, fault type, injection time) come from the official dataset, which
 * is exactly why they are an input rather than something we infer: a guessed
 * label would make the round-trip reproduction score against itself.
 */
function parseIngest(args: string[]): CliParseResult {
  const parsed = parseFlags(args, {
    source: { type: 'string' },
    target: { type: 'string' },
    cases: { type: 'string' },
    system: { type: 'string' },
    output: { type: 'string' },
  });
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

  return {
    ok: true,
    command: {
      command: 'ingest',
      source,
      target: target as PrimeDatasetId,
      cases,
      ...(system !== undefined ? { system: String(system) } : {}),
      ...(v.output !== undefined ? { output: String(v.output) } : {}),
    },
  };
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

/** Semantic-version string. */
export function formatVersion(): string {
  return CLI_VERSION;
}
