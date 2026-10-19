import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { diagnoseRedRun } from '../../../scripts/measure-doc-counts.mjs';

/**
 * What the counting tool says when the suite it counts is red.
 *
 * ## What it used to say
 *
 * `execFileSync` was called without a `catch`. A non-zero exit became an
 * uncaught exception, and Node printed
 *
 *     Error: Command failed: pnpm --filter @rca-bench-factory/core test
 *     <the entire captured stdout>
 *     at checkChildProcessResult (node:internal/child_process:…)
 *
 * The reader had asked for three numbers and got a stack trace. The one fact
 * they needed — *the suite is red, a count of what passed does not exist for a
 * failed run* — was the one line that was not printed.
 *
 * This matters more than a cosmetic message because of when this tool runs: it is
 * what a person reaches for **after** something else has already gone wrong, and
 * a tool that answers a second failure with a third is how a debugging session
 * loses its place.
 *
 * ## Two layers of proof
 *
 * `diagnoseRedRun` is a pure function over (scope, captured error), so every
 * branch is driven directly. The last test runs the whole script against a fake
 * `pnpm` on `PATH` that exits 1 with a vitest-shaped transcript, which is the
 * only way to prove the diagnosis reaches a terminal instead of a stack.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'measure-doc-counts.mjs');

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rca-counts-red-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A captured child-process failure, in the shape `execFileSync` really throws. */
function childFailed(stdout: string, status = 1): { stdout: string; status?: number; message: string } {
  return { stdout, status, message: `Command failed: pnpm test` };
}

const TRANSCRIPT = [
  ' ✓ test/fine.test.ts (3 tests) 12ms',
  '   × test/alpha.test.ts > keeps the invariant 4ms',
  '     → expected 1 to be 2',
  ' FAIL  test/beta.test.ts > reports the thing',
  ' Test Files  2 failed | 1 passed (3)',
  '      Tests  2 failed | 3 passed (5)',
].join('\n');

describe('diagnoseRedRun', () => {
  it('says that a red run has no count, and names the failing tests', () => {
    const lines = diagnoseRedRun('core', childFailed(TRANSCRIPT)).join('\n');
    expect(lines).toContain('the core suite is red, so its counts cannot be measured');
    expect(lines).toContain('A count is what passed');
    // Both spellings vitest uses, because a run that mixes the two is the normal
    // case and a reader should not have to know which reporter produced the line.
    expect(lines).toContain('test/alpha.test.ts > keeps the invariant');
    expect(lines).toContain('test/beta.test.ts > reports the thing');
  });

  it('does not replay the transcript', () => {
    // The whole output is already on the terminal: `stdio` inherits stderr and
    // pipes stdout, and the reader scrolled past it to get here.
    const lines = diagnoseRedRun('core', childFailed(TRANSCRIPT)).join('\n');
    expect(lines).not.toContain('expected 1 to be 2');
    expect(lines).not.toContain('Test Files  2 failed');
    expect(lines.split('\n').length).toBeLessThan(12);
  });

  it('caps the list and says how many are left', () => {
    const many = Array.from({ length: 8 }, (_, i) => `   × test/x.test.ts > case ${i}`).join('\n');
    const lines = diagnoseRedRun('cli', childFailed(many)).join('\n');
    expect(lines).toContain('case 0');
    expect(lines).toContain('case 4');
    expect(lines).not.toContain('case 5');
    expect(lines).toContain('… and 3 more');
  });

  it('lists a repeated failure once', () => {
    const repeated = [
      '   × test/x.test.ts > case 0',
      '   × test/x.test.ts > case 0',
    ].join('\n');
    const lines = diagnoseRedRun('core', childFailed(repeated)).join('\n');
    expect(lines.match(/case 0/g)).toHaveLength(1);
  });

  it('tells the reader to re-run the command that produced the output', () => {
    const lines = diagnoseRedRun('repo', childFailed(TRANSCRIPT)).join('\n');
    expect(lines).toContain('re-run it with `pnpm test`');
  });

  it('distinguishes a run that exited non-zero from one that never started', () => {
    // A missing binary, a signal, a bad cwd: each has a different repair, and
    // none of them is "your tests failed". Reporting the second as the first is
    // how a broken `PATH` becomes a hunt for a failing test that does not exist.
    const neverStarted = diagnoseRedRun('core', { code: 'ENOENT', message: 'spawnSync pnpm ENOENT' }).join('\n');
    expect(neverStarted).toContain('the run did not start (ENOENT)');
    expect(neverStarted).not.toContain('failing test');

    const exited = diagnoseRedRun('core', childFailed('no summary at all', 137)).join('\n');
    expect(exited).toContain('exited 137 and named no failing test');
    expect(exited).toContain('read the run itself for the reason');
  });
});

describe('scripts/measure-doc-counts.mjs against a red suite', () => {
  it('prints the diagnosis and no stack trace', () => {
    // A `pnpm` that fails the way the real one does, in front of the real one on
    // PATH. Nothing in the repository is touched: the script's first act is to
    // spawn its first scope, and that spawn is what this replaces.
    const bin = scratch();
    const fake = join(bin, 'pnpm');
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        "cat <<'OUT'",
        '   × test/alpha.test.ts > keeps the invariant',
        ' Test Files  1 failed (1)',
        '      Tests  1 failed | 3 passed (4)',
        'OUT',
        'exit 1',
        '',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('measure-doc-counts: FAILED');
    expect(result.stderr).toContain('the core suite is red');
    expect(result.stderr).toContain('test/alpha.test.ts > keeps the invariant');
    // The defect this file exists for: a stack trace instead of a verdict.
    expect(result.stderr).not.toContain('Error: Command failed');
    expect(result.stderr).not.toContain('at checkChildProcessResult');
  });
});
