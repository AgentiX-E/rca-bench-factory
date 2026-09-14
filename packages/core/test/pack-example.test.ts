import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_PACK_PREFIX,
  EXAMPLE_PACK_STEPS,
  buildExamplePack,
  exampleTargetCommands,
  renderExampleReadme,
  renderExampleRunScript,
} from '../src/pack/example.js';
import { buildPackManifest, createTarGzip, readTar, verifyPackManifest } from '../src/pack/archive.js';
import type { PackEntry } from '../src/pack/archive.js';
import { SCORE_TARGET_IDS } from '../src/score/score.js';

/**
 * Example-pack tests.
 *
 * The pack is a downloaded artefact, so two properties matter more than the
 * prose: every documented command must be runnable against the files that ship
 * in the pack, and the pack must rebuild to the same bytes every time. Both are
 * asserted here with real data - the file list comes from the real
 * `examples/order-prod` directory, not from a hard-coded expectation.
 */

const EXAMPLE_DIR = new URL('../../../examples/order-prod/', import.meta.url);
const realExampleFiles = readdirSync(EXAMPLE_DIR);

const EXAMPLE_FILES: Record<string, string> = Object.fromEntries(
  realExampleFiles
    .filter((name) => name.endsWith('.json') || name.endsWith('.csv'))
    .map((name) => [`examples/order-prod/${name}`, readFileSync(new URL(name, EXAMPLE_DIR), 'utf8')]),
);

/** Pull every `--flag value` pair that points at a file out of a command. */
function fileArguments(command: string): string[] {
  const values: string[] = [];
  const tokens = command.split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === '--path' || tokens[i] === '--input' || tokens[i] === '--rules') values.push(tokens[i + 1]!);
  }
  return values;
}

describe('EXAMPLE_PACK_STEPS', () => {
  it('walks the whole pipeline in eight steps', () => {
    expect(EXAMPLE_PACK_STEPS).toHaveLength(8);
  });

  it('gives every step a title, a runnable command and a note', () => {
    for (const step of EXAMPLE_PACK_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.command.startsWith('rca-bench ')).toBe(true);
      expect(step.note.length).toBeGreaterThan(0);
    }
  });

  it('only references files that really ship in examples/order-prod', () => {
    const referenced = EXAMPLE_PACK_STEPS.flatMap((step) => fileArguments(step.command));
    expect(referenced.length).toBeGreaterThan(0);
    for (const path of referenced) {
      const name = path.replace(/^examples\/order-prod\//, '');
      expect(realExampleFiles).toContain(name);
    }
  });

  it('covers every CLI stage the user guide documents', () => {
    const commands = EXAMPLE_PACK_STEPS.map((step) => step.command);
    for (const stage of ['source', 'transform', 'case', 'gate', 'export', 'score', 'report', 'evolve']) {
      expect(commands.some((command) => command.startsWith(`rca-bench ${stage} `))).toBe(true);
    }
  });
});

describe('exampleTargetCommands', () => {
  it('covers every score target in the same order as the scorer', () => {
    expect(exampleTargetCommands().map((c) => c.id)).toEqual([...SCORE_TARGET_IDS]);
  });

  it('passes an explicit suite for the RCAEval targets only', () => {
    for (const command of exampleTargetCommands()) {
      if (command.id.startsWith('rcaeval-')) {
        expect(command.exportCommand).toContain(`--suite ${command.id.slice(-3).toUpperCase()}`);
      } else {
        expect(command.exportCommand).not.toContain('--suite');
      }
    }
  });

  it('scores into the same directory it exported into', () => {
    const commands = exampleTargetCommands('bundle.json', './artifacts');
    for (const command of commands) {
      expect(command.exportCommand).toContain('--out-dir ./artifacts');
      expect(command.scoreCommand).toContain('--dir ./artifacts');
    }
  });
});

describe('renderExampleReadme', () => {
  const readme = renderExampleReadme();

  it('is deterministic', () => {
    expect(renderExampleReadme()).toBe(readme);
  });

  it('embeds every step command verbatim', () => {
    for (const step of EXAMPLE_PACK_STEPS) {
      expect(readme).toContain(step.command);
    }
  });

  it('embeds an export command for every score target', () => {
    for (const command of exampleTargetCommands()) {
      expect(readme).toContain(command.exportCommand);
    }
  });

  it('tells the reader how to run the commands without installing the CLI', () => {
    expect(readme).toContain('packages/cli/dist/main.js');
  });
});

describe('renderExampleRunScript', () => {
  const script = renderExampleRunScript();

  it('is a POSIX script that fails fast', () => {
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain('set -eu');
  });

  it('refuses to run when the CLI is not on PATH', () => {
    expect(script).toContain('command -v rca-bench');
    expect(script).toContain('exit 1');
  });

  it('runs every step command verbatim', () => {
    for (const step of EXAMPLE_PACK_STEPS) {
      expect(script).toContain(step.command);
    }
  });

  it('is deterministic', () => {
    expect(renderExampleRunScript()).toBe(script);
  });
});

describe('buildExamplePack', () => {
  const entries = buildExamplePack(EXAMPLE_FILES);

  it('places every example file under the pack prefix', () => {
    const paths = entries.map((e) => e.path);
    for (const file of Object.keys(EXAMPLE_FILES)) {
      expect(paths).toContain(`${EXAMPLE_PACK_PREFIX}/${file}`);
    }
  });

  it('adds a readme, a runnable script and a manifest', () => {
    const paths = entries.map((e) => e.path);
    expect(paths).toContain(`${EXAMPLE_PACK_PREFIX}/README.md`);
    expect(paths).toContain(`${EXAMPLE_PACK_PREFIX}/run.sh`);
    expect(paths).toContain(`${EXAMPLE_PACK_PREFIX}/MANIFEST.json`);
  });

  it('marks run.sh executable and leaves the rest at the default mode', () => {
    const modes = Object.fromEntries(entries.map((e) => [e.path, e.mode]));
    expect(modes[`${EXAMPLE_PACK_PREFIX}/run.sh`]).toBe(0o755);
    expect(modes[`${EXAMPLE_PACK_PREFIX}/README.md`]).toBe(0o644);
  });

  it('ships a manifest that verifies against the pack itself', () => {
    const manifestRaw = entries.find((e) => e.path.endsWith('/MANIFEST.json'))!.content;
    const manifest = JSON.parse(manifestRaw);
    // A recipient hands over the extraction as-is. Previously this test stripped
    // the prefix from the entries to make the manifest verifiable, which encoded
    // the mismatch as the expected contract: in reality a recipient keeps the
    // top-level directory, and the check then failed on every file.
    expect(verifyPackManifest(entries, manifest)).toEqual({
      ok: true,
      missing: [],
      extra: [],
      checksumMismatch: [],
      sizeMismatch: [],
    });
    expect(manifest.fileCount).toBe(entries.length - 1);
    // The example pack is extracted as a whole, so its manifest must also state
    // how many files a recipient ends up with, manifest included.
    expect(manifest.archiveFileCount).toBe(entries.length);
  });

  it('names archive paths in the manifest, prefix included', () => {
    const manifest = JSON.parse(entries.find((e) => e.path.endsWith('/MANIFEST.json'))!.content);
    // Every row must resolve inside the archive the manifest travels in, and the
    // manifest is never one of its own rows.
    expect(manifest.entries.map((e: { path: string }) => e.path).sort()).toEqual(
      entries
        .map((e) => e.path)
        .filter((p) => !p.endsWith('/MANIFEST.json'))
        .sort(),
    );
    for (const row of manifest.entries) {
      expect(row.path.startsWith(`${EXAMPLE_PACK_PREFIX}/`)).toBe(true);
    }
  });

  it('survives a tar round trip with the manifest still verifying', () => {
    const restored = readTar(gunzipSync(createTarGzip(entries)));
    expect(restored.map((e) => e.path)).toEqual(entries.map((e) => e.path));
    const manifest = JSON.parse(restored.find((e) => e.path.endsWith('/MANIFEST.json'))!.content);
    // Verify exactly what was restored, with no path rewriting.
    expect(verifyPackManifest(restored, manifest).ok).toBe(true);
  });

  it('is byte-identical across runs', () => {
    const a = createTarGzip(buildExamplePack(EXAMPLE_FILES));
    const b = createTarGzip(buildExamplePack(EXAMPLE_FILES));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('accepts messy input keys and normalises them', () => {
    const messy = buildExamplePack({ './examples/order-prod//metrics.csv': 'x' });
    expect(messy.map((e) => e.path)).toContain(`${EXAMPLE_PACK_PREFIX}/examples/order-prod/metrics.csv`);
  });

  it('rejects an example path that escapes the pack', () => {
    expect(() => buildExamplePack({ '../secrets.json': 'x' })).toThrow(/traverse upwards/);
  });

  it('honours a custom prefix', () => {
    const custom = buildExamplePack(EXAMPLE_FILES, 'my-pack');
    expect(custom.every((e) => e.path.startsWith('my-pack/'))).toBe(true);
  });

  it('produces entries the archive layer accepts', () => {
    const normalized: PackEntry[] = buildExamplePack(EXAMPLE_FILES);
    expect(buildPackManifest(normalized).fileCount).toBe(normalized.length);
  });
});

describe('the verification recipe the pack ships', () => {
  /**
   * The README inside the archive tells the reader how to verify the download.
   * Documentation that is only read, never executed, drifts silently - which is
   * how the recipe came to run from the pack root while the manifest's paths are
   * relative to the archive root, failing on its first readFileSync.
   *
   * These tests take the commands verbatim from the rendered README and run them
   * against a real archive on a real filesystem.
   */

  /**
   * The verification section's shell block, as one command.
   *
   * The recipe is a single `node -e` whose script spans several lines, so the
   * whole block is joined rather than filtered line by line: taking only the
   * first line drops the closing quote and produces a command no shell can parse.
   */
  function recipeCommands(): string[] {
    const readme = renderExampleReadme(['examples/order-prod/metrics.csv']);
    const section = readme.slice(readme.indexOf('## Verifying what you downloaded'));
    const fence = section.indexOf('```bash');
    const body = section.slice(fence + 7, section.indexOf('```', fence + 7)).trimEnd();
    return [body];
  }

  it('ships exactly one runnable recipe', () => {
    expect(recipeCommands()).toHaveLength(1);
  });

  it('runs against a real extraction and reports the true file count', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { dirname, join } = await import('node:path');

    const dir = mkdtempSync(join(tmpdir(), 'pack-recipe-'));
    try {
      // Unpack the real archive exactly as a recipient would: paths as they are.
      const archive = createTarGzip(buildExamplePack(EXAMPLE_FILES));
      for (const entry of readTar(gunzipSync(archive))) {
        const target = join(dir, entry.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, entry.content);
      }

      const out = execFileSync('sh', ['-c', recipeCommands()[0]!], { cwd: dir }).toString();

      // `fileCount` excludes the manifest, so the reported total is one more.
      const listed = Object.keys(EXAMPLE_FILES).length + 2; // + README.md + run.sh
      expect(out).toContain(`${listed + 1} files verified (${listed} listed, plus the manifest)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
