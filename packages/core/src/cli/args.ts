import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import { T2_IMPLEMENTED_BACKEND_IDS, type T2BackendId } from '../ingest/backends.js';
import { CLICKHOUSE_TIMESTAMP_UNITS, type ClickHousePullOptions } from '../ingest/clickhouse.js';
import {
  ELASTICSEARCH_SORT_DIRECTIONS,
  ELASTICSEARCH_TIMESTAMP_FORMATS,
  type ElasticsearchPullOptions,
} from '../ingest/elasticsearch.js';
import { FILE_FORMATS, type FileFormat, type FileSignalKind } from '../ingest/file.js';
import type { JaegerPullOptions } from '../ingest/jaeger.js';
import { KUBERNETES_TIMESTAMP_FIELDS, type KubernetesPullOptions } from '../ingest/kubernetes.js';
import { LOKI_DIRECTIONS, type LokiPullOptions } from '../ingest/loki.js';
import { PRIME_DATASET_IDS, type PrimeDatasetId } from '../ingest/prime.js';
import type { PrometheusPullOptions } from '../ingest/prometheus.js';
import { SIGNAL_KINDS as IR_SIGNAL_KINDS } from '../ir/types.js';
import { z } from 'zod';
import type { Entity, EntityEdge, SignalKind } from '../ir/types.js';
import { TIME_LAYOUTS, type TimeLayout } from '../util/time.js';
import { RCAEVAL_SUITES, type RcaEvalSuite } from '../export/rcaeval.js';
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

/**
 * The formats `export` can write, declared once.
 *
 * The union used to be written in place -- and the parser compared against a
 * hand-maintained `readonly string[]` beside it. `readonly string[]` constrains
 * nothing, so adding a target to the copy was silent: `export --target ghost`
 * would have parsed and then dispatched nowhere. The tuple is the union's
 * definition now, so the parser, the `--help` placeholder, the refusal text and
 * `EXPORTERS`' `Record<ExportTarget, …>` all read the same seven names.
 */
export const EXPORT_TARGETS = [
  'openrca-1.0',
  'openrca-2.0',
  'rcaeval',
  'rca100',
  'aiops2025',
  'cloud-opsbench',
  'itbench',
] as const;

/** A benchmark format `export` can write. Derived from `EXPORT_TARGETS`. */
export type ExportTarget = (typeof EXPORT_TARGETS)[number];

/**
 * The `evolve` actions, declared once.
 *
 * The type is derived from this tuple rather than written beside it. The parser
 * compared against a separate hand-written `readonly string[]`, and adding a
 * member to that array was silent: `evolve ghost --input …` would have been
 * accepted and then dispatched nowhere. `EVOLVE_ACTION_FLAGS` below is a
 * per-action config and is inherently keyed; `satisfies Record<EvolveAction, …>`
 * is what keeps it exhaustive over the same vocabulary.
 */
export const EVOLVE_ACTIONS = ['propose', 'approve', 'reject', 'stale'] as const;

/** The `evolve` actions. Derived from `EVOLVE_ACTIONS`. */
export type EvolveAction = (typeof EVOLVE_ACTIONS)[number];

/**
 * The backends `pull` accepts, which is the registry's `implemented` set.
 *
 * An alias of `T2_IMPLEMENTED_BACKEND_IDS` rather than a second list. Two lists
 * over one question are the defect this campaign keeps finding (findings
 * 107-109, and the reason `HELP_TOPICS` is derived from `COMMAND_SPECS`): they
 * agree until one of them is updated. The registry has two readers -- this
 * command and `check-backend-support` -- and both derive from it.
 */
export const PULL_BACKEND_IDS: readonly T2BackendId[] = T2_IMPLEMENTED_BACKEND_IDS;

/**
 * `pull` for one backend: the id, and that reader's own options.
 *
 * A general shape instantiated six times rather than six interfaces written out,
 * so the discriminator (`backend`) and the payload (`options`) are visibly tied
 * together. That tie is what lets `runPull` dispatch with a `switch` and hand
 * each reader an options object the compiler has already matched to it.
 */
type PullCommandFor<Id extends T2BackendId, Options> = {
  command: 'pull';
  backend: Id;
  options: Options;
  output?: string;
};

export type PullCommand =
  | PullCommandFor<'prometheus', PrometheusPullOptions>
  | PullCommandFor<'jaeger', JaegerPullOptions>
  | PullCommandFor<'loki', LokiPullOptions>
  | PullCommandFor<'elasticsearch', ElasticsearchPullOptions>
  | PullCommandFor<'clickhouse', ClickHousePullOptions>
  | PullCommandFor<'kubernetes', KubernetesPullOptions>;

export type CliCommand =
  | { command: 'help'; topic?: string }
  | { command: 'version' }
  | PullCommand
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

// The comparison sets below are read, not restated. `FILE_FORMATS` and
// `TIME_LAYOUTS` come from the modules that own them -- which switch
// exhaustively over their unions -- so the CLI cannot admit a value the core
// cannot honour, nor refuse one it can.
/**
 * The signal kinds `source` can detect, as a deliberate subset of the IR's
 * vocabulary.
 *
 * This is narrower than `SIGNAL_KINDS` because `source` reads one file of one
 * shape and can only tell a metric from a log from a trace. Writing the subset
 * by filtering the vocabulary -- rather than as a second literal -- is what
 * keeps an intentional narrowing distinguishable from a stale copy that has
 * silently lost a member.
 */
const SOURCE_SIGNAL_KINDS: readonly SignalKind[] = IR_SIGNAL_KINDS.filter(
  (k): k is SignalKind => k === 'metric' || k === 'log' || k === 'trace',
);
const SIGNAL_KINDS: readonly string[] = SOURCE_SIGNAL_KINDS;
const SUITES: readonly RcaEvalSuite[] = RCAEVAL_SUITES;
const SCORE_TARGETS: readonly string[] = SCORE_TARGET_IDS;

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

/**
 * The widest observation window a prime-dataset slice may declare, in ms.
 *
 * A day is ~1000x the default 10-minute lead, so no real slice approaches it,
 * while the value that does exceed it is a unit error rather than a request:
 * the same digits typed as seconds. The bound is stated once and enforced by
 * `parseWindow`, because the alternative -- letting `Number()` take whatever
 * fits a double -- admits a window 285,000 years wide.
 */
const MAX_WINDOW_MS = 86_400_000;

/**
 * The UTC offsets a real timezone can have, in minutes.
 *
 * The range is the IANA one (`-12:00` to `+14:00`). The parser used to accept
 * any finite number, so `1e21` reached core and `Date.toISOString()` threw
 * `RangeError: Invalid time value` from inside the time parser -- a crash the
 * CLI's own validation had effectively promised could not happen. A value the
 * parser accepts and core cannot honour is a validation gap.
 */
const MIN_OFFSET_MINUTES = -12 * 60;
const MAX_OFFSET_MINUTES = 14 * 60;

/**
 * Read a value flag as a trimmed, non-blank string.
 *
 * Returns `undefined` for absent, which is not the same as `null` for blank:
 * a caller distinguishes "the flag was not given" from "the flag was given a
 * value that cannot be used", and only the second is an error. Blankness is
 * tested after trimming, because `--path "   "` is the empty string typed
 * differently and an empty string was already refused.
 *
 * The `typeof` guard is defence in depth, and it is *known to be unreachable*
 * from `parseCliArgs`: every flag read through this function is declared
 * `type: 'string'` in every spec that declares it, and `parseArgs` under
 * `strict: true` refuses such a flag when no value follows it rather than
 * handing back a placeholder. The one boolean flag in the table, `has-header`,
 * is read with `Boolean(v['has-header'])` and never reaches here. The guard
 * stays because this function is exported behaviour of a module whose input
 * type is wider than any single call site, and because a future spec that
 * renamed a flag across two commands would otherwise route a boolean into
 * `value.trim()` and throw where a diagnostic belongs. It has no unit test
 * asserting the branch is taken: no argv reaches it, and inventing one would
 * be testing the test. `the two flag tables cannot route a non-string into the
 * value reader` pins the invariant that keeps it unreachable.
 */
function asNonBlank(value: ParsedValues[string]): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Read a value flag that must be a non-negative integer within `max`.
 *
 * The whole point of this function is that it rejects what `Number()` would
 * silently accept: `0x10` and `1e3` are numbers, `" 7 "` is a number, and a
 * 21-digit literal is a number that is no longer the one that was typed. A
 * command line carries decimal integers, so the check is a decimal-integer
 * pattern followed by an exact round trip -- `String(n) === text` is what makes
 * the 2^53 boundary observable rather than a rounding nobody sees.
 */
function parseInteger(
  flag: string,
  raw: ParsedValues[string],
  min: number,
  max: number,
): number | undefined | { error: string } {
  if (raw === undefined) return undefined;
  const text = String(raw);
  if (!/^-?\d+$/.test(text)) return { error: `invalid --${flag} '${text}'` };
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return { error: `invalid --${flag} '${text}' (out of range)` };
  if (n < min || n > max) {
    return { error: `invalid --${flag} '${text}' (expected ${min}..${max})` };
  }
  return n;
}

/** A 64-character hex string, the only thing a SHA-256 anchor may be. */
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

/**
 * Validate the `--anchors` map.
 *
 * `--anchors` is a claim that specific files were verified against committed
 * hashes, so each entry has to be a file name and a SHA-256 to compare it
 * against. Checking only that the value is a JSON object let `{"a.txt":123}`
 * through, and a number can never equal a hex digest -- the comparison then
 * fails to match, and the failure is indistinguishable from a genuine content
 * mismatch, which is the one conclusion this flag exists to make trustworthy.
 */
function readAnchors(raw: string): { value: Record<string, string> } | { error: string } {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: '--anchors must be a JSON object' };
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    return { error: '--anchors must name at least one file; omit the flag to score structure only' };
  }
  const anchors: Record<string, string> = {};
  for (const [file, hash] of entries) {
    if (file.trim() === '') {
      return { error: "--anchors has an entry with an empty file name" };
    }
    if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) {
      return {
        error: `--anchors entry '${file}' must be a 64-character hex SHA-256`,
      };
    }
    anchors[file] = hash;
  }
  return { value: anchors };
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
  pull: {
    usage: 'rca-bench pull --backend <backend> [options]',
    description: 'Pull live telemetry from a T2 backend into IR signals.',
    flags: {
      backend: {
        placeholder: `<${PULL_BACKEND_IDS.join('|')}>`,
        type: 'string',
        required: true,
        help: 'Which backend to read from; each accepts a different subset of the options below',
      },
      'base-url': {
        placeholder: '<url>',
        type: 'string',
        required: true,
        help: "Base URL of the backend's API, with or without a trailing slash",
      },
      output: { placeholder: '<file>', type: 'string', help: 'Write the pulled signals to a file instead of stdout' },
      query: {
        placeholder: '<text>',
        type: 'string',
        help: 'PromQL, LogQL or SQL as the backend takes it (prometheus, loki, clickhouse)',
      },
      start: {
        placeholder: '<time>',
        type: 'string',
        help: 'Start of the window, epoch seconds or ISO-8601 (required by every backend but kubernetes)',
      },
      end: {
        placeholder: '<time>',
        type: 'string',
        help: 'End of the window, same encodings as --start (required by every backend but kubernetes)',
      },
      step: { placeholder: '<duration>', type: 'string', help: "Resolution in the backend's own syntax, e.g. 15s (prometheus)" },
      'service-label': {
        placeholder: '<label>',
        type: 'string',
        help: 'Label whose value is the service name (required by loki; optional for prometheus, default `service`)',
      },
      'timeout-ms': { placeholder: '<ms>', type: 'string', help: 'Per-request timeout; optional on every backend' },
      service: {
        placeholder: '<name>',
        type: 'string',
        help: "The service these signals belong to (required by jaeger and kubernetes)",
      },
      limit: {
        placeholder: '<n>',
        type: 'string',
        help: 'Maximum number of records to read (required by jaeger, loki, clickhouse and kubernetes)',
      },
      direction: {
        placeholder: `<${LOKI_DIRECTIONS.join('|')}>`,
        type: 'string',
        help: 'Which end of the Loki window the limit keeps (required by loki)',
      },
      index: { placeholder: '<pattern>', type: 'string', help: 'Index or index pattern to search (required by elasticsearch)' },
      size: { placeholder: '<n>', type: 'string', help: 'Maximum number of hits to read (required by elasticsearch)' },
      'timestamp-format': {
        placeholder: `<${ELASTICSEARCH_TIMESTAMP_FORMATS.join('|')}>`,
        type: 'string',
        help: 'Serialisation of the declared timestamp field (required by elasticsearch)',
      },
      'sort-direction': {
        placeholder: `<${ELASTICSEARCH_SORT_DIRECTIONS.join('|')}>`,
        type: 'string',
        help: 'Which end of the Elasticsearch window the size keeps (required by elasticsearch)',
      },
      fields: {
        placeholder: '<json>',
        type: 'string',
        help: 'Timestamp, message and service field names as inline JSON (required by elasticsearch)',
      },
      columns: {
        placeholder: '<json>',
        type: 'string',
        help: 'Timestamp, message and service column names as inline JSON (required by clickhouse)',
      },
      'timestamp-unit': {
        placeholder: `<${CLICKHOUSE_TIMESTAMP_UNITS.join('|')}>`,
        type: 'string',
        help: 'Unit of a numeric ClickHouse timestamp column; refused for a date-time one (clickhouse)',
      },
      user: { placeholder: '<name>', type: 'string', help: 'ClickHouse user, sent as a header (required by clickhouse)' },
      password: { placeholder: '<secret>', type: 'string', help: 'ClickHouse password; absent omits the header (clickhouse)' },
      database: { placeholder: '<name>', type: 'string', help: 'ClickHouse database to run the statement against (clickhouse)' },
      token: { placeholder: '<token>', type: 'string', help: 'Kubernetes bearer token, never read from the environment (required by kubernetes)' },
      'timestamp-field': {
        placeholder: `<${KUBERNETES_TIMESTAMP_FIELDS.join('|')}>`,
        type: 'string',
        help: 'Which of the event\u2019s timestamps to read (required by kubernetes)',
      },
      namespace: { placeholder: '<name>', type: 'string', help: 'Namespace to read from; absent reads the cluster-wide list (kubernetes)' },
      'field-selector': {
        placeholder: '<selector>',
        type: 'string',
        help: 'A fieldSelector, passed through as written (kubernetes)',
      },
    },
  },
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
      anchors: { placeholder: '<json>', type: 'string', help: 'Returned-file SHA-256 anchors as inline JSON; at least one entry' },
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

/**
 * Command names that own a `COMMAND_SPECS` entry, in help-text order.
 *
 * Read out of the spec table rather than listed beside it. A topic that existed
 * in this array but not in `COMMAND_SPECS` would render an empty help page, and
 * a spec that existed without being listed here would be a command nobody could
 * get help for; both were reachable while the two lists were maintained by hand,
 * and neither was observable -- reordering this array changed nothing a test
 * could see.
 */
export const HELP_TOPICS: readonly string[] = Object.keys(COMMAND_SPECS);

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

/**
 * Which options each backend accepts, and which of those it requires.
 *
 * `COMMAND_SPECS.pull.flags` is the **union** of the six readers' options,
 * because one command has one option table. This is the table that says which
 * part of it a given `--backend` may use, and it is the same shape
 * `EVOLVE_ACTION_FLAGS` gives the `evolve` actions: a shared vocabulary, with a
 * per-value subset that is checked rather than assumed.
 *
 * A flag outside `required ∪ optional` is **refused**, not ignored. `--token` at
 * a Prometheus backend is a configuration the caller believes took effect and
 * Prometheus has no use for; `--namespace` at Loki is a typo that would have
 * read as "the reader ignores namespaces".
 *
 * Written as data rather than as six `parse` functions so that the two questions
 * a reader of this file asks -- "what does ClickHouse need?" and "may I pass
 * `--namespace` to it?" -- are both answered by reading one row.
 */
const PULL_BACKEND_FLAGS = {
  prometheus: {
    required: ['base-url', 'query', 'start', 'end', 'step'],
    optional: ['service-label', 'timeout-ms'],
  },
  jaeger: {
    required: ['base-url', 'service', 'start', 'end', 'limit'],
    optional: ['timeout-ms'],
  },
  loki: {
    required: ['base-url', 'query', 'start', 'end', 'limit', 'direction', 'service-label'],
    optional: ['timeout-ms'],
  },
  elasticsearch: {
    required: ['base-url', 'index', 'start', 'end', 'size', 'timestamp-format', 'sort-direction', 'fields'],
    optional: ['query', 'timeout-ms'],
  },
  clickhouse: {
    required: ['base-url', 'query', 'columns', 'limit', 'user'],
    optional: ['timestamp-unit', 'password', 'database', 'timeout-ms'],
  },
  kubernetes: {
    required: ['base-url', 'service', 'token', 'limit', 'timestamp-field'],
    optional: ['namespace', 'field-selector', 'start', 'end', 'timeout-ms'],
  },
} as const satisfies Record<T2BackendId, { required: readonly string[]; optional: readonly string[] }>;

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

  const path = asNonBlank(v.path);
  if (path === undefined || path === null) {
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

  const assumeOffsetMinutes = parseInteger(
    'assume-offset-minutes',
    v['assume-offset-minutes'],
    MIN_OFFSET_MINUTES,
    MAX_OFFSET_MINUTES,
  );
  if (typeof assumeOffsetMinutes === 'object') return { ok: false, error: assumeOffsetMinutes.error };

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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
    return { ok: false, error: 'export requires --input <bundle.json>' };
  }
  const outDir = asNonBlank(v['out-dir']);
  if (outDir === undefined || outDir === null) {
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
  const dir = asNonBlank(v.dir);
  if (dir === undefined || dir === null) {
    return { ok: false, error: 'score requires --dir <exported-dir>' };
  }
  if (v.anchors !== undefined) {
    const anchors = String(v.anchors);
    if (!isJson(anchors)) {
      return { ok: false, error: 'invalid --anchors JSON' };
    }
    // `--anchors` is a claim that the exported bytes were verified against
    // committed hashes. An empty object asserts that claim and supplies nothing
    // to verify, and accepting it would make the command's green result
    // indistinguishable from one that never checked a hash. Omitting the flag is
    // the honest way to ask for structure-only scoring; supplying an empty set
    // is a contradiction, so it is refused here rather than quietly downgraded.
    //
    // Each entry must also be a file name paired with a SHA-256. Checking only
    // the outer object let `{"a.txt":123}` through, and a number can never equal
    // a hex digest: the comparison fails to match, and that failure is
    // indistinguishable from a genuine content mismatch.
    const checked = readAnchors(anchors);
    if ('error' in checked) return { ok: false, error: checked.error };
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
  if (v.input !== undefined && asNonBlank(v.input) === null) {
    return { ok: false, error: 'invalid --input <bundle.json>' };
  }
  if (v.dir !== undefined && asNonBlank(v.dir) === null) {
    return { ok: false, error: 'invalid --dir <exported-dir>' };
  }
  if (v['allow-empty-reason'] !== undefined && asNonBlank(v['allow-empty-reason']) === null) {
    return { ok: false, error: 'invalid --allow-empty-reason <text>' };
  }

  const input = asNonBlank(v.input) ?? undefined;
  const target = v.target as ScoreTargetId | undefined;
  const dir = asNonBlank(v.dir) ?? undefined;

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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
    return { ok: false, error: 'transform requires --input <source.json>' };
  }
  const rules = asNonBlank(v.rules);
  if (rules === undefined || rules === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
    return { ok: false, error: 'gate requires --input <bundle.json>' };
  }
  const target = asNonBlank(v.target);
  if (target === undefined || target === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
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

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
    return { ok: false, error: 'evolve stale requires --input <proposal.json>' };
  }
  const cases = v.cases;
  if (typeof cases !== 'string' || cases === '') {
    return { ok: false, error: 'evolve stale requires --cases <json-array>' };
  }
  // The shape is checked here, not in the runner. `runEvolveStale` reads this
  // value with `requireArray`, so a non-array was accepted by this module and
  // then threw from inside the command after it had already started -- with a
  // message that named the flag but not that the *value* was the problem. This
  // module is where the argument is validated; leaving half the check to the
  // consumer is how the two came to disagree about what "valid" means.
  const parsedCases = parseJsonArray(cases, '--cases');
  if ('error' in parsedCases) return { ok: false, error: parsedCases.error };

  return {
    ok: true,
    command: { command: 'evolve', action: 'stale', input, cases },
  };
}

function parsePack(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('pack'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const input = asNonBlank(v.input);
  if (input === undefined || input === null) {
    return { ok: false, error: 'pack requires --input <dir>' };
  }
  const output = asNonBlank(v.output);
  if (output === undefined || output === null) {
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
    case 'pull':
      return parsePull(rest);
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

  const source = asNonBlank(v.source);
  if (source === undefined || source === null) {
    return { ok: false, error: 'ingest requires --source <dir>' };
  }
  const target = v.target;
  if (typeof target !== 'string' || !isOneOf(target, PRIME_DATASET_IDS)) {
    return {
      ok: false,
      error: `ingest requires --target <${PRIME_DATASET_IDS.join('|')}>`,
    };
  }
  const cases = asNonBlank(v.cases);
  if (cases === undefined || cases === null) {
    return { ok: false, error: 'ingest requires --cases <cases.json>' };
  }
  // `asNonBlank` returns undefined for an absent flag and null for a blank one,
  // so the two are distinguishable: only the second is a mistake.
  const system = asNonBlank(v.system);
  if (system === null) {
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
 * Read the flags one backend requires, as non-blank strings.
 *
 * Presence and blankness are decided **here**, once. A caller that checked and
 * then re-read would have to handle "absent" a second time, and that branch
 * could not be reached by any input -- this project does not ship those
 * (finding 153 removed a vocabulary member for the same reason).
 */
function readRequiredFlags(
  id: T2BackendId,
  v: ParsedValues,
): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const flag of PULL_BACKEND_FLAGS[id].required) {
    const raw = v[flag];
    if (raw === undefined) return { error: `pull --backend ${id} requires --${flag}` };
    const text = String(raw).trim();
    if (text === '') return { error: `invalid --${flag} for --backend ${id}: must not be blank` };
    values[flag] = text;
  }
  return { values };
}

/**
 * Read a time the way the six readers take it: a bare integer is epoch seconds,
 * anything else is a string for the reader to parse.
 *
 * The conversion is here rather than left to the reader because
 * `Date.parse('1700000000')` is **Invalid Date** -- measured -- so passing the
 * text through would refuse the very encoding the readers document. The bound is
 * `Number.isSafeInteger`, not a range: this is an instant, and a value outside
 * that range is a number that is no longer the one that was typed.
 */
function pullInstant(flag: string, text: string): { value: number | string } | { error: string } {
  if (/^-?\d+$/.test(text)) {
    const n = Number(text);
    if (!Number.isSafeInteger(n)) return { error: `invalid --${flag} '${text}' (out of range)` };
    return { value: n };
  }
  if (Number.isNaN(Date.parse(text))) {
    return { error: `invalid --${flag} '${text}': expected epoch seconds or an ISO-8601 time` };
  }
  return { value: text };
}

/** Read a window whose two bounds a backend requires. */
function requiredWindow(
  r: Record<string, string>,
): { start: number | string; end: number | string } | { error: string } {
  const start = pullInstant('start', r['start']!);
  if ('error' in start) return { error: start.error };
  const end = pullInstant('end', r['end']!);
  if ('error' in end) return { error: end.error };
  return { start: start.value, end: end.value };
}

/** Read an optional time flag; absent means that side of the window is unbounded. */
function optionalInstant(
  flag: string,
  raw: ParsedValues[string],
): { value?: number | string } | { error: string } {
  if (raw === undefined) return {};
  const text = String(raw).trim();
  if (text === '') return { error: `invalid --${flag}: must not be blank` };
  return pullInstant(flag, text);
}

/** Read an optional non-blank string flag; blank is an error, absent is not. */
function optionalText(v: ParsedValues, flag: string): { value?: string } | { error: string } {
  const value = asNonBlank(v[flag]);
  if (value === null) return { error: `invalid --${flag}: must not be blank` };
  return value === undefined ? {} : { value: String(value) };
}

/** Read an optional positive-integer flag. */
function optionalCount(flag: string, raw: ParsedValues[string]): { value?: number } | { error: string } {
  const value = parseInteger(flag, raw, 1, Number.MAX_SAFE_INTEGER);
  if (typeof value === 'object') return { error: value.error };
  return value === undefined ? {} : { value };
}

/**
 * Read a required count, from the non-blank text `readRequiredFlags` produced.
 *
 * Separate from `optionalCount` because the text is known present. Routing it
 * through the absent-handling signature would make `parseInteger`'s `undefined`
 * arm unreachable here while coverage still counted it, which is the shape this
 * project keeps removing rather than tolerating.
 */
function requiredCount(flag: string, text: string): { value: number } | { error: string } {
  if (!/^-?\d+$/.test(text)) return { error: `invalid --${flag} '${text}'` };
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1) {
    return { error: `invalid --${flag} '${text}' (expected a positive integer)` };
  }
  return { value: n };
}

/** Read a required flag that must be one of a closed set, as that set's member type. */
function requiredEnum<T extends string>(
  flag: string,
  text: string,
  allowed: readonly T[],
): { value: T } | { error: string } {
  if (!(allowed as readonly string[]).includes(text)) {
    return { error: `invalid --${flag} '${text}' (expected ${allowed.join('|')})` };
  }
  return { value: text as T };
}

/** Read an optional flag that must be one of a closed set. */
function optionalEnum<T extends string>(
  flag: string,
  raw: ParsedValues[string],
  allowed: readonly T[],
): { value?: T } | { error: string } {
  if (raw === undefined) return {};
  const text = String(raw).trim();
  if (!(allowed as readonly string[]).includes(text)) {
    return { error: `invalid --${flag} '${text}' (expected ${allowed.join('|')})` };
  }
  return { value: text as T };
}

/** The three field names Elasticsearch and ClickHouse both declare a signal with. */
const PULL_FIELD_KEYS = ['timestamp', 'message', 'service'] as const;

/**
 * Read an optional JSON-object flag.
 *
 * When `keys` is given each must be a non-blank string, which is what makes
 * `--fields '{}'` a parse-time mistake rather than a request that reaches a
 * backend and comes back empty. An empty `keys` accepts any object, which is
 * what `elasticsearch --query` needs: that one is the caller's own query, and
 * this repository has no opinion about its shape.
 */
function pullObject(
  flag: string,
  raw: ParsedValues[string],
  keys: readonly string[] = [],
): { value?: Record<string, unknown> } | { error: string } {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch (error) {
    return { error: `invalid --${flag}: ${(error as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: `--${flag} must be a JSON object` };
  }
  const record = parsed as Record<string, unknown>;
  for (const key of keys) {
    const entry = record[key];
    if (typeof entry !== 'string' || entry.trim() === '') {
      return { error: `--${flag} needs a non-blank '${key}' field` };
    }
  }
  return { value: record };
}

/**
 * `pull` reads live telemetry out of one of the six T2 backends.
 *
 * The command exists because the registry's `implemented` rows were reachable
 * from a test and from the package entry point, and from nothing a user could
 * type: six readers that described a *capability* rather than an available
 * operation. `--backend` names one of them, and the flags it accepts are that
 * reader's own options -- the union in `COMMAND_SPECS` narrowed by
 * `PULL_BACKEND_FLAGS`, so a token handed to Prometheus is refused rather than
 * dropped.
 */
function parsePull(args: string[]): CliParseResult {
  const parsed = parseFlags(args, flagOptions('pull'));
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const backend = v.backend;
  if (typeof backend !== 'string' || !isOneOf(backend, PULL_BACKEND_IDS)) {
    return { ok: false, error: `pull requires --backend <${PULL_BACKEND_IDS.join('|')}>` };
  }
  const id = backend as T2BackendId;

  // Every flag the command advertises reaches here parsed; only this backend's
  // own are legal. `backend` and `output` are the two that belong to all six.
  const spec = PULL_BACKEND_FLAGS[id];
  const legal = new Set<string>([...spec.required, ...spec.optional]);
  for (const name of Object.keys(v)) {
    if (name === 'backend' || name === 'output') continue;
    if (!legal.has(name)) return { ok: false, error: `pull --backend ${id} does not accept --${name}` };
  }

  const required = readRequiredFlags(id, v);
  if ('error' in required) return { ok: false, error: required.error };
  // `readRequiredFlags` refused an absent or blank required flag above, so every
  // `r[flag]` below is a non-blank string.
  const r = required.values;

  const output = asNonBlank(v.output);
  if (output === null) return { ok: false, error: 'invalid --output <file>' };
  const out = output === undefined ? {} : { output: String(output) };

  switch (id) {
    case 'prometheus': {
      const window = requiredWindow(r);
      if ('error' in window) return { ok: false, error: window.error };
      const serviceLabel = optionalText(v, 'service-label');
      if ('error' in serviceLabel) return { ok: false, error: serviceLabel.error };
      const timeoutMs = optionalCount('timeout-ms', v['timeout-ms']);
      if ('error' in timeoutMs) return { ok: false, error: timeoutMs.error };
      return {
        ok: true,
        command: {
          command: 'pull',
          backend: 'prometheus',
          options: {
            baseUrl: r['base-url']!,
            query: r['query']!,
            start: window.start,
            end: window.end,
            step: r['step']!,
            ...(serviceLabel.value !== undefined ? { serviceLabel: serviceLabel.value } : {}),
            ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
          },
          ...out,
        },
      };
    }
    case 'jaeger': {
      const window = requiredWindow(r);
      if ('error' in window) return { ok: false, error: window.error };
      const limit = requiredCount('limit', r['limit']!);
      if ('error' in limit) return { ok: false, error: limit.error };
      const timeoutMs = optionalCount('timeout-ms', v['timeout-ms']);
      if ('error' in timeoutMs) return { ok: false, error: timeoutMs.error };
      return {
        ok: true,
        command: {
          command: 'pull',
          backend: 'jaeger',
          options: {
            baseUrl: r['base-url']!,
            service: r['service']!,
            start: window.start,
            end: window.end,
            limit: limit.value,
            ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
          },
          ...out,
        },
      };
    }
    case 'loki': {
      const window = requiredWindow(r);
      if ('error' in window) return { ok: false, error: window.error };
      const limit = requiredCount('limit', r['limit']!);
      if ('error' in limit) return { ok: false, error: limit.error };
      const direction = requiredEnum('direction', r['direction']!, LOKI_DIRECTIONS);
      if ('error' in direction) return { ok: false, error: direction.error };
      const timeoutMs = optionalCount('timeout-ms', v['timeout-ms']);
      if ('error' in timeoutMs) return { ok: false, error: timeoutMs.error };
      return {
        ok: true,
        command: {
          command: 'pull',
          backend: 'loki',
          options: {
            baseUrl: r['base-url']!,
            query: r['query']!,
            start: window.start,
            end: window.end,
            limit: limit.value,
            direction: direction.value,
            serviceLabel: r['service-label']!,
            ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
          },
          ...out,
        },
      };
    }
    case 'elasticsearch': {
      const window = requiredWindow(r);
      if ('error' in window) return { ok: false, error: window.error };
      const size = requiredCount('size', r['size']!);
      if ('error' in size) return { ok: false, error: size.error };
      const timestampFormat = requiredEnum(
        'timestamp-format',
        r['timestamp-format']!,
        ELASTICSEARCH_TIMESTAMP_FORMATS,
      );
      if ('error' in timestampFormat) return { ok: false, error: timestampFormat.error };
      const sortDirection = requiredEnum('sort-direction', r['sort-direction']!, ELASTICSEARCH_SORT_DIRECTIONS);
      if ('error' in sortDirection) return { ok: false, error: sortDirection.error };
      const fields = pullObject('fields', v['fields'], PULL_FIELD_KEYS);
      if ('error' in fields) return { ok: false, error: fields.error };
      const query = pullObject('query', v['query']);
      if ('error' in query) return { ok: false, error: query.error };
      const timeoutMs = optionalCount('timeout-ms', v['timeout-ms']);
      if ('error' in timeoutMs) return { ok: false, error: timeoutMs.error };
      const mapping = fields.value!;
      return {
        ok: true,
        command: {
          command: 'pull',
          backend: 'elasticsearch',
          options: {
            baseUrl: r['base-url']!,
            index: r['index']!,
            start: window.start,
            end: window.end,
            size: size.value,
            timestampFormat: timestampFormat.value,
            sortDirection: sortDirection.value,
            fields: {
              timestamp: mapping['timestamp'] as string,
              message: mapping['message'] as string,
              service: mapping['service'] as string,
            },
            ...(query.value !== undefined ? { query: query.value } : {}),
            ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
          },
          ...out,
        },
      };
    }
    case 'clickhouse': {
      const limit = requiredCount('limit', r['limit']!);
      if ('error' in limit) return { ok: false, error: limit.error };
      const columns = pullObject('columns', v['columns'], PULL_FIELD_KEYS);
      if ('error' in columns) return { ok: false, error: columns.error };
      const timestampUnit = optionalEnum('timestamp-unit', v['timestamp-unit'], CLICKHOUSE_TIMESTAMP_UNITS);
      if ('error' in timestampUnit) return { ok: false, error: timestampUnit.error };
      const database = optionalText(v, 'database');
      if ('error' in database) return { ok: false, error: database.error };
      const timeoutMs = optionalCount('timeout-ms', v['timeout-ms']);
      if ('error' in timeoutMs) return { ok: false, error: timeoutMs.error };
      const mapping = columns.value!;
      return {
        ok: true,
        command: {
          command: 'pull',
          backend: 'clickhouse',
          options: {
            baseUrl: r['base-url']!,
            query: r['query']!,
            columns: {
              timestamp: mapping['timestamp'] as string,
              message: mapping['message'] as string,
              service: mapping['service'] as string,
            },
            limit: limit.value,
            user: r['user']!,
            // A password may be the empty string -- "absent" and "empty" are
            // different to the reader, and to the server -- so it is carried
            // verbatim rather than put through the blank-is-an-error reader.
            ...(v['password'] !== undefined ? { password: String(v['password']) } : {}),
            ...(timestampUnit.value !== undefined ? { timestampUnit: timestampUnit.value } : {}),
            ...(database.value !== undefined ? { database: database.value } : {}),
            ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
          },
          ...out,
        },
      };
    }
    // Named rather than left to a `default`, so that a seventh backend added to
    // the registry fails `pnpm typecheck` here (TS2366) instead of being parsed
    // as Kubernetes. `PULL_BACKEND_FLAGS` fails the same way, on its missing row.
    case 'kubernetes': {
      const limit = requiredCount('limit', r['limit']!);
      if ('error' in limit) return { ok: false, error: limit.error };
      const timestampField = requiredEnum('timestamp-field', r['timestamp-field']!, KUBERNETES_TIMESTAMP_FIELDS);
      if ('error' in timestampField) return { ok: false, error: timestampField.error };
      const namespace = optionalText(v, 'namespace');
      if ('error' in namespace) return { ok: false, error: namespace.error };
      const fieldSelector = optionalText(v, 'field-selector');
      if ('error' in fieldSelector) return { ok: false, error: fieldSelector.error };
      const start = optionalInstant('start', v['start']);
      if ('error' in start) return { ok: false, error: start.error };
      const end = optionalInstant('end', v['end']);
      if ('error' in end) return { ok: false, error: end.error };
      const timeoutMs = optionalCount('timeout-ms', v['timeout-ms']);
      if ('error' in timeoutMs) return { ok: false, error: timeoutMs.error };
      return {
        ok: true,
        command: {
          command: 'pull',
          backend: 'kubernetes',
          options: {
            baseUrl: r['base-url']!,
            service: r['service']!,
            token: r['token']!,
            limit: limit.value,
            timestampField: timestampField.value,
            ...(namespace.value !== undefined ? { namespace: namespace.value } : {}),
            ...(fieldSelector.value !== undefined ? { fieldSelector: fieldSelector.value } : {}),
            ...(start.value !== undefined ? { start: start.value } : {}),
            ...(end.value !== undefined ? { end: end.value } : {}),
            ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
          },
          ...out,
        },
      };
    }
  }
}

/**
 * The shape a hand-written JSON list flag must have before core sees it.
 *
 * Deliberately weaker than `entityGraphSchema`: this checks only what a
 * *parser* can know -- that the value is a non-empty array of objects -- and
 * leaves field rules to the ingest layer. Running the full entity schema here
 * would duplicate a check core already owns and, worse, replace its precise
 * message ("declared entity 'x' needs a non-blank name") with a generic
 * "invalid --entities JSON" that names neither the field nor the value.
 */
const jsonObjectList = z.array(z.record(z.unknown())).min(1);

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
  const result = jsonObjectList.safeParse(parsed.value);
  if (!result.success) return { error: `invalid ${flag} JSON` };
  // The values are objects but not yet *entities*: only shape is checked here.
  // `ingestPrimeDataset` re-validates them against the entity contract before
  // use, so this assertion marks a deliberate trust boundary -- the type is
  // established downstream, and the parse-time check would only duplicate it
  // with a worse message.
  return { value: result.data as unknown as Entity[] };
}

function parseEdgeList(raw: string, flag: string): { value: EntityEdge[] } | { error: string } {
  const parsed = parseJsonValue(raw, flag);
  if ('error' in parsed) return parsed;
  const result = jsonObjectList.safeParse(parsed.value);
  if (!result.success) return { error: `invalid ${flag} JSON` };
  return { value: result.data as unknown as EntityEdge[] };
}

function parseJsonValue(raw: string, flag: string): { value: unknown } | { error: string } {
  if (!isJson(raw)) return { error: `invalid ${flag} JSON` };
  return { value: JSON.parse(raw) as unknown };
}

/**
 * Parse a JSON-array flag, the shape every consumer of one requires.
 *
 * Stated here once because the alternative already happened: `--cases` was
 * checked for JSON-ness only, and the array check lived in the runner. Two
 * modules enforcing different halves of one contract means the parser says a
 * value is valid and the consumer says it is not, with the caller learning
 * which from an error raised mid-command.
 */
function parseJsonArray(raw: string, flag: string): { value: unknown[] } | { error: string } {
  const parsed = parseJsonValue(raw, flag);
  if ('error' in parsed) return parsed;
  if (!Array.isArray(parsed.value)) {
    return { error: `${flag} must be a JSON array` };
  }
  return { value: parsed.value };
}

/**
 * Parse a millisecond window flag.
 *
 * Non-negative integers within a day, by the same rule the offset flag uses.
 * A negative window has no coherent meaning, and a fractional one is almost
 * always a unit error -- seconds typed where milliseconds were expected -- so
 * both are rejected rather than quietly rounded into something the caller did
 * not ask for.
 *
 * The upper bound is what closes the gap this flag used to have: the check was
 * `/^\d+$/`, which a 21-digit literal passes, and `Number()` then rounded it to
 * `1e20` without complaint. The window became a Date roughly three million
 * years wide, which is not the window that was written down.
 */
function parseWindow(flag: string, raw: ParsedValues[string]): number | undefined | { error: string } {
  return parseInteger(flag, raw, 0, MAX_WINDOW_MS);
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
    '  pull       Pull live telemetry from a T2 backend into IR signals',
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
