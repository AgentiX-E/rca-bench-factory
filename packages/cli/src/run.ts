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
  exportForScoreTarget,
  EXPORTERS,
  MANIFEST_FILE_NAME,
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
  TARGET_REQUIREMENTS,
  sha256Bytes,
  transformBatch,
} from '@rca-bench-factory/core';
import type {
  BuildProposalInput,
  CliCommand,
  EvolutionProposal,
  ExportOutcome,
  ExportedFiles,
  FileFormat,
  FileIngestOptions,
  FileLayout,
  FileQuarantineRecord,
  FileSignalKind,
  G1Options,
  IrBundle,
  OfficialRegressionOptions,
  OfficialRegressionReport,
  PrimeCaseReport,
  PrimeCaseSource,
  ScoreTargetId,
  SkippedCase,
  SourceRecord,
  TransformResult,
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

/**
 * Map a target id to the G1 structural-gate contract it must satisfy.
 *
 * The required modalities are read from `TARGET_REQUIREMENTS` rather than
 * restated here. This function used to carry its own nine-row table, and it had
 * already drifted from the coverage report's: that one asked `cloud-opsbench`
 * for metrics, logs and traces, this one for metrics alone, so `gate` admitted a
 * log-less bundle that `report` quarantined. Two tables over one question have
 * two answers, and neither is the rule.
 *
 * `requiresQuery` stays here because it is a *structural-gate* fact, not a
 * modality requirement - OpenRCA 1.0's task index is derived from the query, and
 * no other target's layout depends on it.
 */
function g1OptionsForTarget(target: ScoreTargetId): G1Options {
  return { requiredSignals: TARGET_REQUIREMENTS[target], requiresQuery: target === 'openrca-1.0' };
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
  reportSourceLosses(result.quarantine, result.signals.length + result.quarantine.length, ctx);
  const output = JSON.stringify(result, null, 2) + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

/**
 * What the `export` command was asked for: its target, and the suite if it gave one.
 *
 * The mapping from a *score* target onto an exporter lives in core, in
 * `scoreTargetInvocation`, because both the CLI and the official-metric
 * regression script need it and neither should own it. This is the other
 * direction: the `export` command names its target directly, so the only thing
 * left to decide here is the suite default.
 */
function exportForCommandTarget(bundle: IrBundle, cmd: Extract<CliCommand, { command: 'export' }>): ExportOutcome {
  return EXPORTERS[cmd.target](bundle, cmd.suite ?? 'RE2');
}

/**
 * Name the cases an exporter could not express, so a shrinking benchmark is
 * visible.
 *
 * The exporters already compute this and the CLI used to discard it, producing
 * an artefact covering fewer cases than the bundle with exit code 0 and no
 * output at all. The operator's benchmark then silently shrank, and `score`
 * scored the remainder and reported a number that looked complete.
 *
 * The CLI reference promises the opposite: a case-level defect is "skipped per
 * case and the remaining cases still export, matching how `rca-bench gate`
 * *quarantines* rather than rejects such a bundle". Quarantine is reported on
 * stderr by `ingest`, `source` and `transform`, so export reports it too --
 * through the same renderer, for the same reason.
 */
function reportExportSkips(
  skipped: readonly SkippedCase[],
  inputCases: number,
  ctx: Ctx,
  label = 'warning',
): void {
  if (skipped.length === 0) return;
  ctx.stderr(`${label}: ${skipped.length} of ${inputCases} case(s) skipped\n`);
  reportRejections(
    skipped.length,
    skipped.slice(0, MAX_REPORTED_ROWS),
    (s) => ({ where: s.caseId, reason: s.reason }),
    ctx,
  );
}

async function runExport(cmd: Extract<CliCommand, { command: 'export' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  // The schema validates structure at runtime; `quality` is deliberately untyped
  // (`z.unknown()`) in the schema, so it is projected onto the static IR type.
  const bundle = irBundleSchema.parse(JSON.parse(raw)) as IrBundle;

  const outcome = exportForCommandTarget(bundle, cmd);
  reportExportSkips(outcome.skipped, bundle.cases.length, ctx);
  await writeFiles(resolve(ctx.cwd, cmd.outDir), outcome.files);
  return 0;
}

async function runReport(cmd: Extract<CliCommand, { command: 'report' }>, ctx: Ctx): Promise<number> {
  const raw = await readFile(resolve(ctx.cwd, cmd.input), 'utf8');
  const bundle = irBundleSchema.parse(JSON.parse(raw)) as IrBundle;
  const target = cmd.target ?? 'openrca-1.0';

  const coverage = computeCoverage(bundle);
  const runAt = new Date().toISOString();
  const { report } = runAllGates(bundle, { g1: g1OptionsForTarget(target) }, { gateRunId: runAt, runAt });
  const outcome = exportForScoreTarget(bundle, target);
  const score = scoreExport(target, outcome.files);

  // The page is the artefact that outlives the command, so the loss is written
  // into the page; the terminal gets it too, because an operator who asked for
  // `--output` still reads stderr and one who asked for stdout reads nothing else.
  reportExportSkips(outcome.skipped, bundle.cases.length, ctx);

  const html = renderPage({
    title: cmd.title ?? 'rca-bench report',
    coverage,
    entityGraph: bundle.graph,
    gates: [report],
    scores: [{ ...score, scope: { total: bundle.cases.length, skipped: outcome.skipped } }],
  });

  const output = html + '\n';
  if (cmd.output !== undefined) {
    await writeFile(resolve(ctx.cwd, cmd.output), output);
  } else {
    ctx.stdout(output);
  }
  return 0;
}

const MAX_REPORTED_ROWS = 10;

/**
 * Render one rejection report: a total, then up to `MAX_REPORTED_ROWS` details.
 *
 * Four commands (`source`, `transform`, `ingest`, `export`) each lose records and
 * each has to say so. They differ only in how a lost record is *located* - a line
 * number, a record id, a file plus line, a case id. Callers therefore pass the
 * already-truncated rows plus a label and a reason for each, so this function
 * never indexes anything and has no unreachable defensive branches to test.
 *
 * Keeping the shape in a single place is deliberate: hand-written copies of a
 * renderer are a list that must drift from the thing it describes, which is the
 * defect this project keeps finding.
 *
 * Callers only invoke this when at least one record was rejected, so there is no
 * zero-total branch here: a guard for a state no caller can produce would be a
 * branch that can never fail, and this project does not ship those.
 *
 * The total is never capped. A truncated list and a short list look the same to
 * a reader, and only one of them means "your data is mostly gone", so the cap is
 * stated explicitly whenever it applies.
 */
function reportRejections<R>(
  total: number,
  shown: readonly R[],
  describe: (row: R) => { where: string; reason: string },
  ctx: Ctx,
): void {
  for (const row of shown) {
    const { where, reason } = describe(row);
    ctx.stderr(`  ${where}: ${reason}\n`);
  }
  if (total > shown.length) {
    ctx.stderr(`  ... and ${total - shown.length} more\n`);
  }
}

/**
 * Report what `ingestPrimeDataset` rejected, so the loss is visible.
 *
 * The ingest contract is "zero silent loss": every source record is either a
 * validated signal or a quarantine entry. The entries are returned per case, and
 * until this function existed the runner discarded them — a source that lost
 * half its rows produced a bundle and an empty stderr, so the bundle on disk was
 * indistinguishable from one built from a source that only ever had half the
 * rows. The report is the entire mechanism the invariant depends on, so it is
 * printed rather than computed and dropped.
 */
function reportIngestLosses(report: readonly PrimeCaseReport[], ctx: Ctx): void {
  for (const rep of report) {
    if (rep.quarantine.length === 0) continue;
    ctx.stderr(`warning: case '${rep.caseId}': ${rep.quarantine.length} source row(s) rejected\n`);
    reportRejections(
      rep.quarantine.length,
      rep.quarantine.slice(0, MAX_REPORTED_ROWS),
      (q) => ({
        // `line` is 1-based, or 0 when the whole file was refused before any row
        // was parsed. Printing "line 0" would invent a line that does not exist.
        where: q.line === 0 ? `${q.file} (whole file)` : `${q.file}, line ${q.line}`,
        reason: q.reason,
      }),
      ctx,
    );
  }
}

/**
 * Report what `ingestFile` rejected, so a lossy `source` run is visible.
 *
 * `source` is the first command in the pipeline, so its losses propagate: a row
 * dropped here is a row no gate, score or export will ever see. Its artefact is
 * a plain list of signals, which carries no hint that anything was left out - a
 * three-row file with one bad row produces a JSON document identical to one from
 * a two-row clean file. Naming the rejected lines is what makes them different.
 */
function reportSourceLosses(quarantine: readonly FileQuarantineRecord[], inputRows: number, ctx: Ctx): void {
  if (quarantine.length === 0) return;
  ctx.stderr(`warning: ${quarantine.length} of ${inputRows} record(s) rejected\n`);
  reportRejections(
    quarantine.length,
    quarantine.slice(0, MAX_REPORTED_ROWS),
    (q) => ({ where: `line ${q.line}`, reason: q.reason }),
    ctx,
  );
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

  reportIngestLosses(result.report, ctx);
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
    // Nine targets export one bundle, and a target is allowed to drop a case it
    // cannot represent. Naming the loss per target is what keeps "9 passed" from
    // meaning "nine complete benchmarks" when one of them was half a benchmark.
    const outcomes = SCORE_TARGET_IDS.map((target) => ({ target, outcome: exportForScoreTarget(bundle, target) }));
    for (const { target, outcome } of outcomes) {
      // No `skipped.length === 0` guard here: `reportExportSkips` already stays
      // silent for a clean export, and a second copy of that rule would be a
      // second rule free to disagree with the first.
      reportExportSkips(outcome.skipped, bundle.cases.length, ctx, `warning: ${target}`);
    }
    const exports = Object.fromEntries(
      outcomes.map(({ target, outcome }) => [target, outcome.files]),
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
 * The manifest is written *into* the archive, so its rows name archive paths,
 * `--prefix` included: whoever unpacks the archive can resolve every row without
 * knowing how the pack was built. Stripping the prefix produced a manifest that
 * described the input directory instead of the archive it travelled inside, so
 * every file in a prefixed pack was reported both missing and undeclared.
 */
async function runPack(cmd: Extract<CliCommand, { command: 'pack' }>, ctx: Ctx): Promise<number> {
  const files = await readFilesRecursive(resolve(ctx.cwd, cmd.input));
  if (files[MANIFEST_FILE_NAME] !== undefined) {
    throw new Error(`the input directory already contains ${MANIFEST_FILE_NAME}, which pack reserves for its own manifest`);
  }

  const prefix = cmd.prefix ?? '';
  const inPack = (path: string): string => (prefix === '' ? path : `${prefix}/${path}`);
  const entries = normalizePackEntries(
    Object.entries(files).map(([path, content]) => ({ path: inPack(path), content })),
  );
  // The manifest is written into the archive, so its rows name archive paths.
  // Stripping the prefix here produced a manifest that named files the archive
  // did not contain, which made every prefixed pack fail its own verification.
  const manifest = buildPackManifest(entries);

  const archiveEntries = [
    ...entries,
    { path: inPack(MANIFEST_FILE_NAME), content: renderPackManifest(manifest) },
  ];
  const archive = createTarGzip(archiveEntries);
  const output = resolve(ctx.cwd, cmd.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, archive);

  ctx.stdout(
    `${JSON.stringify(
      {
        output: cmd.output,
        // `fileCount` counts the content files the manifest lists; `archiveFileCount`
        // counts the files a recipient extracts, this manifest included. Both are
        // reported because they answer different questions, and the previous single
        // field answered the extraction question with the content answer.
        fileCount: manifest.fileCount,
        archiveFileCount: archiveEntries.length,
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

/**
 * Report what `transform` refused to convert, and what it could not identify.
 *
 * The written bundle carries `counts`, but a count is a number, not a lead:
 * "2 of 3 rows survived" does not tell the operator which row to go and look at.
 * Worse, a bundle built from a three-row source with one rejection is
 * byte-identical to one built from a two-row source, so the loss is invisible in
 * the artefact itself. Naming the records on stderr is what makes those two
 * artefacts distinguishable.
 *
 * `idFieldMisses` and `duplicateIds` are reported separately because neither is a
 * rejected row: the first says the caller's identifier scheme did not apply, the
 * second says the ids it produced no longer identify. Both leave a well-formed
 * artefact, which is exactly why they need saying out loud.
 */
function reportTransformLosses(result: TransformResult, idField: string | undefined, ctx: Ctx): void {
  const { input, quarantine } = result.counts;
  if (quarantine > 0) {
    ctx.stderr(`warning: ${quarantine} of ${input} record(s) rejected\n`);
    reportRejections(
      quarantine,
      result.quarantined.slice(0, MAX_REPORTED_ROWS),
      (q) => ({ where: q.recordId, reason: `${q.code} (rule '${q.ruleId}')` }),
      ctx,
    );
  }

  if (idField !== undefined && result.idFieldMisses > 0) {
    ctx.stderr(
      `warning: --id-field '${idField}' identified ${input - result.idFieldMisses} of ${input} record(s); the rest use positional ids\n`,
    );
  }

  if (result.duplicateIds.length > 0) {
    ctx.stderr(
      `warning: ${result.duplicateIds.length} id value(s) are not unique, so they no longer identify a record: ${result.duplicateIds.join(', ')}\n`,
    );
  }
}

async function runTransform(cmd: Extract<CliCommand, { command: 'transform' }>, ctx: Ctx): Promise<number> {
  const input = requireArray<SourceRecord>(await readFile(resolve(ctx.cwd, cmd.input), 'utf8'), '--input');
  const rules = requireArray<TransformRule>(await readFile(resolve(ctx.cwd, cmd.rules), 'utf8'), '--rules');
  const result = transformBatch(input, rules, { idField: cmd.idField });
  reportTransformLosses(result, cmd.idField, ctx);
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
