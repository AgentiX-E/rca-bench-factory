import { buildPackManifest, normalizePackEntries, renderPackManifest } from './archive.js';
import type { PackEntry } from './archive.js';
import { SCORE_TARGET_IDS } from '../score/score.js';
import type { ScoreTargetId } from '../score/score.js';

/**
 * The downloadable example pack.
 *
 * Documentation proves a pipeline exists; a pack proves it runs. This module
 * owns the canonical command list for the `order-prod` example and renders the
 * three files that turn the repository's `examples/` directory into something a
 * reader can download and execute:
 *
 *   - `README.md`    - the eight pipeline steps, every one of them runnable;
 *   - `run.sh`       - the same eight commands, wired to fail fast;
 *   - `MANIFEST.json` - per-file size and SHA-256 so the download is verifiable.
 *
 * The commands here are the ones `docs/user-guide.md` executes, so the pack can
 * never drift away from the documentation.
 */

/** Root directory inside the archive. */
export const EXAMPLE_PACK_PREFIX = 'rca-bench-factory-examples';

/** Executable permission bits for the generated `run.sh`. */
const SCRIPT_MODE = 0o755;

const DEFAULT_BUNDLE = 'examples/order-prod/bundle.json';
const DEFAULT_OUT_DIR = './out';

/** One pipeline step: what it is, the exact command, and why it matters. */
export interface ExamplePackStep {
  title: string;
  command: string;
  note: string;
}

/**
 * The eight canonical steps, in order.
 *
 * Every command is executed verbatim by `run.sh` and rendered verbatim by the
 * README, and every `--path`/`--input`/`--rules` argument resolves to a file
 * that ships in the pack (the test suite reads the real `examples/` directory to
 * keep that true).
 */
export const EXAMPLE_PACK_STEPS: readonly ExamplePackStep[] = [
  {
    title: 'Ingest the raw telemetry',
    command: 'rca-bench source --path examples/order-prod/metrics.csv --signal-kind metric --assume-offset-minutes 480',
    note: 'The source carries no UTC offset and no service column, so both are declared here rather than guessed. Every ingested signal keeps its raw value alongside the normalised one.',
  },
  {
    title: 'Normalise a non-standard column layout',
    command: 'rca-bench transform --input examples/order-prod/records.json --rules examples/order-prod/rules.json',
    note: 'Time, unit and categorical mapping rules are data, not code: the same rules file replays against the next export of the same system.',
  },
  {
    title: 'Assemble the case',
    command: 'rca-bench case --input examples/order-prod/draft.json --output ./bundle.json',
    note: 'The draft omits the fault category on purpose; the assembler infers `resource` and records the inference. `examples/order-prod/bundle.json` is this exact output, pre-built so the next steps run without step 3.',
  },
  {
    title: 'Run the quality gates',
    command: 'rca-bench gate --input examples/order-prod/bundle.json --target rca100',
    note: 'G1-G5 decide whether the case is allowed to exist. A gate failure here is the cheapest defect you will ever find.',
  },
  {
    title: 'Export a target contract',
    command: 'rca-bench export --target rca100 --input examples/order-prod/bundle.json --out-dir ./out',
    note: 'One case, one target contract. Swap the target for any of the nine listed below; the IR does not change.',
  },
  {
    title: 'Verify the export',
    command: 'rca-bench score --target rca100 --dir ./out',
    note: 'Structure checks plus Golden-Master checksum anchors. Exit code 1 means the dataset is not submittable - wire this into CI.',
  },
  {
    title: 'Render the evidence report',
    command: 'rca-bench report --input examples/order-prod/bundle.json --target rca100 --title "order-prod demo" --output report.html',
    note: 'A single self-contained HTML page: coverage, entity graph, gates and score. This is what a human reviewer actually reads.',
  },
  {
    title: 'Propose an evolution',
    command: 'rca-bench evolve propose --input examples/order-prod/proposal-draft.json',
    note: 'A rule change becomes a reviewable proposal with a regression estimate, and nothing reaches the benchmark until a human approves it.',
  },
];

/** The export and score command pair for one score target. */
export interface ExampleTargetCommand {
  id: ScoreTargetId;
  exportCommand: string;
  scoreCommand: string;
}

/** The `--target` value the export command needs for a score target. */
function exportTargetFor(id: ScoreTargetId): string {
  return id.startsWith('rcaeval-') ? 'rcaeval' : id;
}

/**
 * Export/score command pairs for every score target.
 *
 * RCAEval is one exporter with three suites, so those ids additionally carry
 * `--suite`; every other target maps straight through.
 */
export function exampleTargetCommands(
  input: string = DEFAULT_BUNDLE,
  outDir: string = DEFAULT_OUT_DIR,
): ExampleTargetCommand[] {
  return SCORE_TARGET_IDS.map((id) => {
    const suite = id.startsWith('rcaeval-') ? ` --suite ${id.slice(-3).toUpperCase()}` : '';
    return {
      id,
      exportCommand: `rca-bench export --target ${exportTargetFor(id)}${suite} --input ${input} --out-dir ${outDir}`,
      scoreCommand: `rca-bench score --target ${id} --dir ${outDir}`,
    };
  });
}

/** Render the pack README. `files` is the list of pack-relative paths to list. */
export function renderExampleReadme(files: readonly string[] = []): string {
  const lines: string[] = [
    '# rca-bench-factory examples',
    '',
    'A copy-and-run copy of the `order-prod` example: the same telemetry, drafts and',
    'rules that every command in the documentation is executed against.',
    '',
    '## What is inside',
    '',
    '```',
    'README.md',
    'run.sh',
    'MANIFEST.json',
    ...files.map((file) => file),
    '```',
    '',
    '## Prerequisites',
    '',
    'The commands below assume `rca-bench` is on your `PATH`:',
    '',
    '```bash',
    'npm install -g @rca-bench-factory/cli',
    '```',
    '',
    'Working from a clone instead? Use the built entrypoint directly:',
    '`node /path/to/rca-bench-factory/packages/cli/dist/main.js <command> ...`',
    '',
    '## The eight steps',
    '',
    'Run them in order, or run all of them with `sh run.sh`.',
    '',
  ];

  EXAMPLE_PACK_STEPS.forEach((step, index) => {
    lines.push(`### ${index + 1}. ${step.title}`, '', step.note, '', '```bash', step.command, '```', '');
  });

  lines.push(
    '## All nine score targets',
    '',
    'One IR bundle, nine contracts. Export any of them from the same `bundle.json`.',
    '',
    '| Target | Export | Verify |',
    '| --- | --- | --- |',
  );
  for (const command of exampleTargetCommands()) {
    lines.push(
      `| \`${command.id}\` | \`${command.exportCommand}\` | \`${command.scoreCommand}\` |`,
    );
  }

  lines.push(
    '',
    '## Verifying what you downloaded',
    '',
    'Every file is listed in `MANIFEST.json` with its byte length and SHA-256. Check the',
    'extracted tree against it:',
    '',
    '```bash',
    'node -e \'const fs=require("fs"),c=require("crypto"),m=require("./MANIFEST.json");',
    '  for (const e of m.entries) {',
    '    const b=fs.readFileSync(e.path);',
    '    if (b.length!==e.bytes||c.createHash("sha256").update(b).digest("hex")!==e.sha256) throw new Error("mismatch: "+e.path);',
    '  }',
    '  console.log(m.fileCount+" files verified");\'',
    '```',
    '',
    'The archive itself is reproducible: rebuilding it from the same inputs produces',
    'byte-identical output, because every tar field that could carry a timestamp or a',
    'user id is pinned to zero.',
    '',
    '## Regenerating this pack',
    '',
    '```bash',
    'pnpm examples:bundle   # rebuild site/assets/rca-bench-factory-examples.tar.gz',
    '```',
    '',
    'Generated by `packages/core/src/pack/example.ts`. Do not edit by hand.',
    '',
  );

  return lines.join('\n');
}

/** Render the POSIX script that runs every step in order. */
export function renderExampleRunScript(): string {
  const lines: string[] = [
    '#!/bin/sh',
    '# Run every documented rca-bench command against the bundled example.',
    '#',
    '# Generated by packages/core/src/pack/example.ts - do not edit by hand.',
    'set -eu',
    '',
    'if ! command -v rca-bench >/dev/null 2>&1; then',
    '  echo "rca-bench is not on PATH." >&2',
    '  echo "Install it with: npm install -g @rca-bench-factory/cli" >&2',
    '  echo "Or run the same commands as: node <repo>/packages/cli/dist/main.js <command> ..." >&2',
    '  exit 1',
    'fi',
    '',
    '# Run from the pack root so every relative path resolves.',
    'cd "$(dirname "$0")"',
    '',
  ];

  EXAMPLE_PACK_STEPS.forEach((step, index) => {
    lines.push(`# ${index + 1}. ${step.title}`, step.command, '');
  });

  lines.push('echo "all eight steps completed"', '');
  return lines.join('\n');
}

/**
 * Build the complete entry list for the example pack.
 *
 * `files` is keyed by repository-relative path (`examples/order-prod/...`). The
 * manifest describes the pack from its own root, so the prefix is stripped from
 * manifest paths and the manifest is excluded from itself.
 */
export function buildExamplePack(
  files: Record<string, string>,
  prefix: string = EXAMPLE_PACK_PREFIX,
): PackEntry[] {
  const packed = normalizePackEntries([
    ...Object.entries(files).map(([path, content]) => ({ path: `${prefix}/${path}`, content })),
    { path: `${prefix}/README.md`, content: renderExampleReadme(Object.keys(files).sort()) },
    { path: `${prefix}/run.sh`, content: renderExampleRunScript(), mode: SCRIPT_MODE },
  ]);

  const manifestPath = `${prefix}/MANIFEST.json`;
  const manifest = renderPackManifest(
    buildPackManifest(
      packed.map((entry) => ({ ...entry, path: entry.path.slice(prefix.length + 1) })),
    ),
  );

  return normalizePackEntries([...packed, { path: manifestPath, content: manifest }]);
}
