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
    // The manifest describes the pack from its own root, so the prefix is stripped.
    const relative = entries
      .filter((e) => !e.path.endsWith('/MANIFEST.json'))
      .map((e) => ({ ...e, path: e.path.slice(EXAMPLE_PACK_PREFIX.length + 1) }));
    expect(verifyPackManifest(relative, manifest)).toEqual({
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

  it('survives a tar round trip with the manifest still verifying', () => {
    const restored = readTar(gunzipSync(createTarGzip(entries)));
    expect(restored.map((e) => e.path)).toEqual(entries.map((e) => e.path));
    const manifest = JSON.parse(restored.find((e) => e.path.endsWith('/MANIFEST.json'))!.content);
    const relative = restored
      .filter((e) => !e.path.endsWith('/MANIFEST.json'))
      .map((e) => ({ ...e, path: e.path.slice(EXAMPLE_PACK_PREFIX.length + 1) }));
    expect(verifyPackManifest(relative, manifest).ok).toBe(true);
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
