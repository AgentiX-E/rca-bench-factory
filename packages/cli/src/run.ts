import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { join as posixJoin } from 'node:path/posix';
import {
  approveProposal,
  assembleBundle,
  buildEvolutionProposal,
  computeCoverage,
  computeStaleCases,
  detectFileLayout,
  exportAioPs2025,
  exportCloudOpsBench,
  exportItBench,
  exportOpenRca,
  exportOpenRca2,
  exportRca100,
  exportRcaEval,
  buildPackManifest,
  createTarGzip,
  formatCommandHelp,
  formatHelp,
  formatVersion,
  ingestFile,
  ingestPrimeDataset,
  irBundleSchema,
  normalizePackEntries,
  parseCliArgs,
  parseDelimited,
  parseJsonArray,
  parseJsonl,
  rejectProposal,
  renderPackManifest,
  renderPage,
  runAllGates,
  runAllOfficialRegressions,
  runOfficialRegression,
  SCORE_TARGET_IDS,
  scoreExport,
  sha256Bytes,
  transformBatch,
} from '@rca-bench-factory/core';
import type {
  BuildProposalInput,
  CliCommand,
  EvolutionProposal,
  ExportedFiles,
  FileFormat,
  FileIngestOptions,
  FileLayout,
  FileSignalKind,
  G1Options,
  IrBundle,
  OfficialRegressionOptions,
  OfficialRegressionReport,
  PrimeCaseSource,
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
    'openrca-2.0': ['metric', 'trace'],
    'rcaeval-re1': ['metric'],
    'rcaeval-re2': ['metric', 'log'],
    'rcaeval-re3': ['metric', 'log', 'trace'],
    rca100: ['metric', 'log', 'trace', 'event', 'alert'],
    aiops2025: ['metric', 'log', 'trace'],
    'cloud-opsbench': ['metric'],
    itbench: ['metric', 'log', 'trace'],
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
  } else if (cmd.target === 'openrca-2.0') {
    files = exportOpenRca2(bundle).files;
  } else if (cmd.target === 'rcaeval') {
    files = exportRcaEval(bundle, cmd.suite ?? 'RE2').files;
  } else if (cmd.target === 'rca100') {
    files = exportRca100(bundle).files;
  } else if (cmd.target === 'aiops2025') {
    files = exportAioPs2025(bundle).files;
  } else if (cmd.target === 'cloud-opsbench') {
    files = exportCloudOpsBench(bundle).files;
  } else {
    files = exportItBench(bundle).files;
  }

  await writeFiles(resolve(ctx.cwd, cmd.outDir), files);
  return 0;
}

/** Export a bundle for a score target (ScoreTargetId → the matching exporter). */
function exportForScoreTarget(bundle: IrBundle, target: ScoreTargetId): ExportedFiles {
  if (target === 'openrca-1.0') return exportOpenRca(bundle).files;
  if (target === 'openrca-2.0') return exportOpenRca2(bundle).files;
  if (target === 'rcaeval-re1') return exportRcaEval(bundle, 'RE1').files;
  if (target === 'rcaeval-re2') return exportRcaEval(bundle, 'RE2').files;
  if (target === 'rcaeval-re3') return exportRcaEval(bundle, 'RE3').files;
  if (target === 'rca100') return exportRca100(bundle).files;
  if (target === 'aiops2025') return exportAioPs2025(bundle).files;
  if (target === 'cloud-opsbench') return exportCloudOpsBench(bundle).files;
  return exportItBench(bundle).files;
}

async function runReport(cmd: Extract<CliCommand, { command: 'report' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  const bundle = irBundleSchema.parse(JSON.parse(raw)) as IrBundle;
  const target = cmd.target ?? 'openrca-1.0';

  const coverage = computeCoverage(bundle);
  const runAt = new Date().toISOString();
  const { report } = runAllGates(bundle, { g1: g1OptionsForTarget(target) }, { gateRunId: runAt, runAt });
  const score = scoreExport(target, exportForScoreTarget(bundle, target));

  const html = renderPage({
    title: cmd.title ?? 'rca-bench report',
    coverage,
    entityGraph: bundle.graph,
    gates: [report],
    scores: [score],
  });

  const output = html + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

/**
 * `ingest` reads a prime dataset off disk, turns it into an IR bundle and writes
 * the bundle out.
 *
 * The descriptor file supplies the case labels, so the command is deliberately
 * dumb about them: it reads what the operator wrote and refuses to continue when
 * the data contradicts it. `hardErrors` are reported on stderr without failing
 * the run, because a bundle that covers the other cases is still useful; a case
 * that was never read must be visible rather than silently scored as zero.
 */
async function runIngest(cmd: Extract<CliCommand, { command: 'ingest' }>, ctx: Ctx): Promise<number> {
  const files = await readFilesRecursive(resolve(ctx.cwd, cmd.source));
  const descriptors = requireArray<PrimeCaseSource>(
    await readFile(resolve(ctx.cwd, cmd.cases), 'utf8'),
    '--cases',
  );

  const result = ingestPrimeDataset(files, {
    dataset: cmd.target,
    system: cmd.system ?? cmd.target,
    cases: descriptors,
    ...(cmd.entities !== undefined ? { extraEntities: cmd.entities } : {}),
    ...(cmd.edges !== undefined ? { extraEdges: cmd.edges } : {}),
    ...(cmd.leadMs !== undefined ? { leadMs: cmd.leadMs } : {}),
    ...(cmd.lagMs !== undefined ? { lagMs: cmd.lagMs } : {}),
  });
  if (!result.ok) {
    ctx.stderr(`error: ${result.error}\n`);
    return 1;
  }

  for (const hard of result.hardErrors) ctx.stderr(`warning: ${hard}\n`);
  if (result.unclaimed.length > 0) {
    ctx.stderr(`warning: ${result.unclaimed.length} file(s) matched no case: ${result.unclaimed.join(', ')}\n`);
  }

  const output = JSON.stringify(result.bundle, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
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

/**
 * Run the official-metric regression.
 *
 * The report is emitted in full: the oracle score, the whole mutation grid and
 * the metric provenance (`official` for a metric transcribed from the upstream
 * scorer, `derived` for one reconstructed from the paper). Hiding any of it
 * would defeat the point of the command, which is to make the claim
 * "our export scores 1.0 under the upstream rule" falsifiable.
 */
async function runOfficial(cmd: Extract<CliCommand, { command: 'official' }>, ctx: Ctx): Promise<number> {
  const options: OfficialRegressionOptions = {
    ...(cmd.allowEmptyReason !== undefined ? { allowEmptyReason: cmd.allowEmptyReason } : {}),
  };

  let reports: OfficialRegressionReport[];
  if (cmd.mode === 'bundle') {
    const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
    const bundle = irBundleSchema.parse(JSON.parse(raw)) as IrBundle;
    const exports = Object.fromEntries(
      SCORE_TARGET_IDS.map((target) => [target, exportForScoreTarget(bundle, target)]),
    ) as Record<ScoreTargetId, Record<string, string>>;
    reports = runAllOfficialRegressions(exports, options);
  } else {
    const files = await readFilesRecursive(resolve(ctx.cwd, cmd.dir));
    reports = [runOfficialRegression(cmd.target, files, options)];
  }

  const counts = {
    passed: reports.filter((r) => r.status === 'passed').length,
    skipped: reports.filter((r) => r.status === 'skipped').length,
    failed: reports.filter((r) => r.status === 'failed').length,
  };
  const payload = JSON.stringify({ passed: counts.failed === 0, counts, reports }, null, 2) + '\n';

  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), payload);
  } else {
    ctx.stdout(payload);
  }
  return counts.failed === 0 ? 0 : 1;
}

/**
 * Pack a directory into a reproducible archive.
 *
 * The manifest is listed from the pack's own root, so a `--prefix` is stripped
 * from the manifest paths: whoever unpacks the archive can verify it without
 * knowing how it was built.
 */
async function runPack(cmd: Extract<CliCommand, { command: 'pack' }>, ctx: Ctx): Promise<number> {
  const files = await readFilesRecursive(resolve(ctx.cwd, cmd.input));
  if (files['MANIFEST.json'] !== undefined) {
    throw new Error('the input directory already contains MANIFEST.json, which pack reserves for its own manifest');
  }

  const prefix = cmd.prefix ?? '';
  const inPack = (path: string): string => (prefix === '' ? path : `${prefix}/${path}`);
  const entries = normalizePackEntries(
    Object.entries(files).map(([path, content]) => ({ path: inPack(path), content })),
  );
  const manifest = buildPackManifest(
    entries.map((entry) => ({ ...entry, path: entry.path.slice(prefix === '' ? 0 : prefix.length + 1) })),
  );

  const archive = createTarGzip([...entries, { path: inPack('MANIFEST.json'), content: renderPackManifest(manifest) }]);
  const output = resolve(ctx.cwd, cmd.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, archive);

  ctx.stdout(
    `${JSON.stringify(
      {
        output: cmd.output,
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        archiveBytes: archive.length,
        sha256: sha256Bytes(archive),
      },
      null,
      2,
    )}\n`,
  );
  return 0;
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

/** Read and parse an evolution proposal JSON file. */
async function readProposal(cwd: string, path: string): Promise<EvolutionProposal> {
  const raw = await readFile(resolve(cwd, path), 'utf8');
  return JSON.parse(raw) as EvolutionProposal;
}

async function runEvolvePropose(cmd: Extract<CliCommand, { command: 'evolve'; action: 'propose' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  const draft = JSON.parse(raw) as BuildProposalInput;
  const proposal = buildEvolutionProposal(draft);
  const output = JSON.stringify(proposal, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

async function runEvolveApprove(cmd: Extract<CliCommand, { command: 'evolve'; action: 'approve' }>, ctx: Ctx): Promise<number> {
  const proposal = await readProposal(ctx.cwd, cmd.input);
  const approved = approveProposal(proposal, cmd.note);
  const output = JSON.stringify(approved, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

async function runEvolveReject(cmd: Extract<CliCommand, { command: 'evolve'; action: 'reject' }>, ctx: Ctx): Promise<number> {
  const proposal = await readProposal(ctx.cwd, cmd.input);
  const rejected = rejectProposal(proposal, cmd.note);
  const output = JSON.stringify(rejected, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

async function runEvolveStale(cmd: Extract<CliCommand, { command: 'evolve'; action: 'stale' }>, ctx: Ctx): Promise<number> {
  const proposal = await readProposal(ctx.cwd, cmd.input);
  const cases = requireArray<string>(cmd.cases, '--cases');
  const stale = computeStaleCases(cases, proposal);
  ctx.stdout(JSON.stringify(stale, null, 2) + '\n');
  return 0;
}

async function runEvolve(cmd: Extract<CliCommand, { command: 'evolve' }>, ctx: Ctx): Promise<number> {
  switch (cmd.action) {
    case 'propose':
      return await runEvolvePropose(cmd, ctx);
    case 'approve':
      return await runEvolveApprove(cmd, ctx);
    case 'reject':
      return await runEvolveReject(cmd, ctx);
    default:
      return await runEvolveStale(cmd, ctx);
  }
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
        // A topic narrows the output to one command's reference; without one
        // the full command list is printed. `parseCliArgs` guarantees the topic
        // is a known command, so no "unknown topic" branch is needed here.
        ctx.stdout((parsed.command.topic !== undefined ? formatCommandHelp(parsed.command.topic) : formatHelp()) + '\n');
        return 0;
      case 'version':
        ctx.stdout(formatVersion() + '\n');
        return 0;
      case 'source':
        return await runSource(parsed.command, ctx);
      case 'export':
        return await runExport(parsed.command, ctx);
      case 'ingest':
        return await runIngest(parsed.command, ctx);
      case 'score':
        return await runScore(parsed.command, ctx);
      case 'official':
        return await runOfficial(parsed.command, ctx);
      case 'transform':
        return await runTransform(parsed.command, ctx);
      case 'gate':
        return await runGate(parsed.command, ctx);
      case 'case':
        return await runCase(parsed.command, ctx);
      case 'report':
        return await runReport(parsed.command, ctx);
      case 'pack':
        return await runPack(parsed.command, ctx);
      case 'evolve':
        return await runEvolve(parsed.command, ctx);
    }
  } catch (e) {
    // Every throw site reachable from here (fs/promises, JSON.parse, zod,
    // parseJsonObject) throws an `Error` instance, so `.message` is always
    // defined. The contract is trusted instead of re-checked on every failure.
    ctx.stderr(`error: ${(e as Error).message}\n`);
    return 1;
  }
}
