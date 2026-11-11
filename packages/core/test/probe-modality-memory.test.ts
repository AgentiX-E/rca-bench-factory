import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The probe that measures what one modality comparison costs.
 *
 * `compareModalityTables` is the busiest function in the round trip -- 168 of one
 * run's 270 cases failed on it -- and it was the only stage whose memory had never
 * been measured. The round trip's heap budget died at 12,005 MB of 12,288 inside the
 * first TrainTicket case, and the sentence recording what was known said the
 * comparison's peak was unmeasured because no run had carried one of those cases to
 * the end of it (finding 511).
 *
 * The probe answers it with a synthetic table in the corpus's shape. This file holds
 * the half a number cannot: that the reading is *taken* -- the probe reaches the
 * comparison, on both paths, and refuses rather than reporting a zero when it cannot
 * -- and that its two refusals are reachable rather than decorative.
 *
 * What it does not hold is the number. A budget asserted on a synthetic table would
 * be a test of the machine's allocator, and the number belongs in the round's
 * readings with the command that produced it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'probe-modality-memory.mjs');

/**
 * The script this file executes.
 *
 * Both of the probe's failure sites are published as `proved`, and rule 7 of
 * `gate-sites-are-proven.test.ts` reconciles a declaration against spawn calls in the
 * file that names it. The claim lives here, beside the tests that back it.
 */
const DRIVES = ['scripts/probe-modality-memory.mjs'];

interface Run {
  readonly status: number;
  readonly out: string;
  readonly err: string;
}

function run(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Run {
  const done = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env,
  });
  return { status: done.status ?? -1, out: done.stdout, err: done.stderr };
}

describe('scripts/probe-modality-memory.mjs · the reading is taken, and it is taken of this', () => {
  it('measures a small table and names the module and the function it measured', () => {
    const measured = run(['1000']);

    expect(measured.err).toBe('');
    expect(measured.status).toBe(0);
    // The reading is about a named module: a number without the thing it measured is
    // the shape this repository has had to repair three times in one round.
    expect(measured.out).toContain('modality comparison: 1000 row(s)');
    expect(measured.out).toMatch(/\d+ bytes\/row/);
    expect(measured.out).toContain('rowsMatch=false');
    expect(measured.out).toContain('onlyInCorpus=1');
  });

  it('reaches the passing path when the export matches, and says the rows match', () => {
    // The two paths differ in shape -- the column pass builds arrays only when the
    // signatures disagree -- so a probe that only ever measured one of them would
    // report the other by assumption.
    const measured = run(['2000', '--same']);

    expect(measured.status).toBe(0);
    expect(measured.out).toContain('rowsMatch=true');
    expect(measured.out).toContain('onlyInCorpus=0');
    expect(measured.out).toContain('an export that matches');
  });

  it('refuses when the built module it reads is not there, rather than reporting zero', () => {
    // A probe that printed `0 bytes/row` for a module it could not load would be the
    // defect it exists to measure: a zero and a refusal read the same in a table.
    const absent = join(ROOT, 'scripts', 'no-such-build', 'modalities.js');
    const measured = run(['1000'], { ...process.env, RCA_MODALITY_BUNDLE: absent });

    expect(measured.status).toBe(1);
    expect(measured.err).toContain('is missing');
    expect(measured.err).toContain('reads the built module, not the source');
    expect(measured.out).toBe('');
  });

  it('refuses a row count it cannot use, and says what it got', () => {
    const measured = run(['not-a-number']);

    expect(measured.status).toBe(1);
    expect(measured.err).toContain("is not a row count");
  });
});
