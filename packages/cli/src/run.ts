import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { join as posixJoin } from 'node:path/posix';
import {
  assembleBundle,
  detectFileLayout,
  exportAioPs2025,
  exportOpenRca,
  exportRca100,
  exportRcaEval,
  formatHelp,
  formatVersion,
  ingestFile,
  irBundleSchema,
  parseCliArgs,
  parseDelimited,
  parseJsonArray,
  parseJsonl,
  runAllGates,
  scoreExport,
  transformBatch,
} from '@rca-bench-factory/core';
import type {
  CliCommand,
  ExportedFiles,
  FileFormat,
  FileIngestOptions,
  FileLayout,
  FileSignalKind,
  G1Options,
  IrBundle,
  ScoreTargetId,
  SignalKind,
  SourceRecord,
  TransformRule,
} from '@rca-bench-factory/core';

/**
 * `rca-bench` command runner.
 *
 * This module is the IO boundary of the CLI: it turns a parsed command into real
 * file operations. The filesystem is the real `node:fs/promises` (no abstraction,
 * no mocks); only the working directory and the output sinks are injectable so the
 * suite can drive the runner against a real temporary directory.
 */

export interface RunOptions {
  /** Base directory for relative paths. Defaults to `process.cwd()`. */
  cwd?: string;
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
}

interface Ctx {
  cwd: string;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

/** Parse a JSON-object flag value; throws a clear error on a non-object. */
function parseJsonObject(raw: string, flag: string): Record<string, unknown> {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${flag} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Parse a JSON-array flag value; throws a clear error on a non-array. */
function requireArray<T>(raw: string, flag: string): T[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${flag} must be a JSON array`);
  }
  return parsed as T[];
}

/** Map a target id to the G1 structural-gate contract it must satisfy. */
function g1OptionsForTarget(target: ScoreTargetId): G1Options {
  const requiredSignals: Record<ScoreTargetId, SignalKind[]> = {
    'openrca-1.0': ['metric', 'trace'],
    'rcaeval-re1': ['metric'],
    'rcaeval-re2': ['metric', 'log'],
    'rcaeval-re3': ['metric', 'log', 'trace'],
    rca100: ['metric', 'log', 'trace', 'event', 'alert'],
    aiops2025: ['metric', 'log', 'trace'],
  };
  return { requiredSignals: requiredSignals[target], requiresQuery: target === 'openrca-1.0' };
}

/**
 * Auto-detect a column layout from the first record of a source, so the `source`
 * command needs no explicit `--layout` for well-known column names.
 */
function detectLayout(text: string, format: FileFormat, signalKind: FileSignalKind): FileLayout {
  if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'csv' ? ',' : '\t';
    const { rows } = parseDelimited(text, delimiter);
    return detectFileLayout(rows[0] ?? [], signalKind);
  }
  const parsed = format === 'jsonl' ? parseJsonl(text) : parseJsonArray(text);
  return detectFileLayout(Object.keys(parsed.records[0] ?? {}), signalKind);
}

/** Recursively read every file under `dir` into a relative-path → content map. */
async function readFilesRecursive(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await readFilesRecursive(full);
      for (const [rel, content] of Object.entries(nested)) out[posixJoin(entry.name, rel)] = content;
    } else {
      out[entry.name] = await readFile(full, 'utf8');
    }
  }
  return out;
}

/** Write an exported file map to disk, creating parent directories as needed. */
async function writeFiles(outDir: string, files: ExportedFiles): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(outDir, relPath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

async function runSource(cmd: Extract<CliCommand, { command: 'source' }>, ctx: Ctx): Promise<number> {
  const text = await readFile(resolve(ctx.cwd, cmd.path), 'utf8');
  const layout =
    cmd.layout !== undefined
      ? (parseJsonObject(cmd.layout, '--layout') as FileLayout)
      : detectLayout(text, cmd.format ?? 'csv', cmd.signalKind ?? 'metric');

  const options: FileIngestOptions = {
    format: cmd.format ?? 'csv',
    signalKind: cmd.signalKind ?? 'metric',
    layout,
    ...(cmd.timeLayout !== undefined ? { timeLayout: cmd.timeLayout } : {}),
    ...(cmd.assumeOffsetMinutes !== undefined ? { assumeOffsetMinutes: cmd.assumeOffsetMinutes } : {}),
    ...(cmd.delimiter !== undefined ? { delimiter: cmd.delimiter } : {}),
    ...(cmd.hasHeader !== undefined ? { hasHeader: cmd.hasHeader } : {}),
    ...(cmd.serviceName !== undefined ? { serviceName: cmd.serviceName } : {}),
  };

  const result = ingestFile(text, options);
  const output = JSON.stringify(result, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

async function runExport(cmd: Extract<CliCommand, { command: 'export' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  // The schema validates structure at runtime; `quality` is deliberately untyped
  // (`z.unknown()`) in the schema, so it is projected onto the static IR type.
  const bundle = irBundleSchema.parse(JSON.parse(raw)) as IrBundle;

  let files: ExportedFiles;
  if (cmd.target === 'openrca-1.0') {
    files = exportOpenRca(bundle).files;
  } else if (cmd.target === 'rcaeval') {
    files = exportRcaEval(bundle, cmd.suite ?? 'RE2').files;
  } else if (cmd.target === 'rca100') {
    files = exportRca100(bundle).files;
  } else {
    files = exportAioPs2025(bundle).files;
  }

  await writeFiles(resolve(ctx.cwd, cmd.outDir), files);
  return 0;
}

async function runScore(cmd: Extract<CliCommand, { command: 'score' }>, ctx: Ctx): Promise<number> {
  const files = await readFilesRecursive(resolve(ctx.cwd, cmd.dir));
  const anchors =
    cmd.anchors !== undefined ? (parseJsonObject(cmd.anchors, '--anchors') as Record<string, string>) : undefined;
  const report = scoreExport(cmd.target, files, anchors);
  ctx.stdout(JSON.stringify(report, null, 2) + '\n');
  return report.passed ? 0 : 1;
}

async function runTransform(cmd: Extract<CliCommand, { command: 'transform' }>, ctx: Ctx): Promise<number> {
  const input = requireArray<SourceRecord>(await readFile(resolve(ctx.cwd, cmd.input), 'utf8'), '--input');
  const rules = requireArray<TransformRule>(await readFile(resolve(ctx.cwd, cmd.rules), 'utf8'), '--rules');
  const result = transformBatch(input, rules, { idField: cmd.idField });
  const output = JSON.stringify(result, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

async function runGate(cmd: Extract<CliCommand, { command: 'gate' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  const bundle = irBundleSchema.parse(JSON.parse(raw)) as IrBundle;
  const runAt = new Date().toISOString();
  const { report } = runAllGates(bundle, { g1: g1OptionsForTarget(cmd.target) }, { gateRunId: cmd.gateRunId ?? runAt, runAt });
  ctx.stdout(JSON.stringify(report, null, 2) + '\n');
  return 0;
}

async function runCase(cmd: Extract<CliCommand, { command: 'case' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  const result = assembleBundle(JSON.parse(raw));
  if (!result.ok) throw new Error(result.error);
  const output = JSON.stringify(result.bundle, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

/**
 * Run a full `argv` command and return the process exit code.
 *
 * Errors are reported on `stderr` and map to exit code 1; a failing `score` also
 * maps to exit code 1 so CI can gate on it.
 */
export async function run(argv: string[], options: RunOptions = {}): Promise<number> {
  const ctx: Ctx = {
    cwd: options.cwd ?? process.cwd(),
    stdout: options.stdout ?? ((chunk) => process.stdout.write(chunk)),
    stderr: options.stderr ?? ((chunk) => process.stderr.write(chunk)),
  };

  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    ctx.stderr(`error: ${parsed.error}\n`);
    ctx.stderr("Run 'rca-bench --help' for usage.\n");
    return 1;
  }

  try {
    switch (parsed.command.command) {
      case 'help':
        ctx.stdout(formatHelp() + '\n');
        return 0;
      case 'version':
        ctx.stdout(formatVersion() + '\n');
        return 0;
      case 'source':
        return await runSource(parsed.command, ctx);
      case 'export':
        return await runExport(parsed.command, ctx);
      case 'score':
        return await runScore(parsed.command, ctx);
      case 'transform':
        return await runTransform(parsed.command, ctx);
      case 'gate':
        return await runGate(parsed.command, ctx);
      case 'case':
        return await runCase(parsed.command, ctx);
    }
  } catch (e) {
    // Every throw site reachable from here (fs/promises, JSON.parse, zod,
    // parseJsonObject) throws an `Error` instance, so `.message` is always
    // defined. The contract is trusted instead of re-checked on every failure.
    ctx.stderr(`error: ${(e as Error).message}\n`);
    return 1;
  }
}
