import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SCORE_TARGET_IDS } from '../src/score/score.js';

/**
 * The contract `scripts/check-official.mjs` publishes.
 *
 * The script is not a duplicate of the test suite and is not meant to be one:
 * it pins the *outcome* - eight targets scored by their upstream rule, one
 * refused by its own contract - on the shipped example, which no unit test can
 * give because the unit tests do not load `examples/order-prod/bundle.json`.
 *
 * What it must not do is restate the target-to-exporter mapping. It used to,
 * and the copy was silent when wrong: swapping `rcaeval-re1`'s suite to `RE2`
 * left the script printing `PASS rcaeval-re1 cases=1` and exiting 0. These tests
 * read the script's real output, so the report it prints is asserted rather than
 * assumed.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-official.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function runScript(): Outcome {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** The `PASS`/`SKIP`/`FAIL` lines the script prints, one per target. */
function verdictLines(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => /^(PASS|SKIP|FAIL)\s/.test(line))
    .map((line) => line.trim());
}

const result = runScript();
const verdicts = verdictLines(result.stdout);

describe('scripts/check-official.mjs · the report it prints', () => {
  it('exits 0 on the shipped example', () => {
    expect(result.status).toBe(0);
  });

  it('reports on every declared score target, one line each', () => {
    expect(verdicts).toHaveLength(SCORE_TARGET_IDS.length);
  });

  it('reports on the targets the scorer declares, by name', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(verdicts.some((line) => line.includes(target))).toBe(true);
    }
  });

  // The one skip is a fact about the example, not a convenience: RCAEval RE3
  // admits code-level faults only and the example is a CPU-saturation case.
  it('skips exactly one target, and it is rcaeval-re3', () => {
    const skipped = verdicts.filter((line) => line.startsWith('SKIP'));
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain('rcaeval-re3');
  });

  it('scores the other eight', () => {
    expect(verdicts.filter((line) => line.startsWith('PASS'))).toHaveLength(SCORE_TARGET_IDS.length - 1);
  });

  it('names the case count for every target, so a shrunken export is visible', () => {
    for (const line of verdicts) {
      expect(line).toMatch(/cases=\d+/);
    }
  });
});
