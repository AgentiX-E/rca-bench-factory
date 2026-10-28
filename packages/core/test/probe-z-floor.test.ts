import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The probe that asks whether the corpus's ranking depends on a constant.
 *
 * `zScore` divides by `max(sigma, 1e-6)`. For a series that is flat before the onset, sigma is zero and
 * the statistic is the excursion divided by a number from the implementation -- so a counter that steps
 * from zero outranks everything else by five orders of magnitude, not because it moved more but because
 * its baseline had nothing to normalise by. `checkDiscrimination` accepts a case only when a separate
 * component is *strictly louder* than the answer, so if "louder" were a function of that constant the
 * corpus's headline reading would be measuring its own floor.
 *
 * The probe answers it by ranking the corpus twice -- shipped floor and a relative one -- and this file
 * holds two things about the answer:
 *
 *   - the reading is taken at all, on every case, with no unresolved reference and no non-finite
 *     statistic. That half exists because the probe's first version skipped parameter resolution and
 *     reported two `NaN`s as measurements, which is the failure mode a probe has: a second reader of
 *     the same files, measuring its own bug with the same confidence;
 *   - **no case's `strict` classification turns on the floor.** This is the claim the corpus's
 *     evidence rests on, and it is a ratchet rather than a snapshot: if a future case's strictness
 *     depends on the constant, the failure here is the question "is this case evidence, or is it the
 *     floor?" and the answer belongs in an annotation rather than in a looser assertion.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'probe-z-floor.mjs');
const CASES = resolve(ROOT, 'golden-master', 'fault-cases');

/**
 * The scripts this file executes.
 *
 * The probe's one failure site is published as `proved`, and rule 7 of `gate-sites-are-proven.test.ts`
 * will not accept that on the strength of this file naming the script. It reconciles a declaration
 * against the spawn calls below, so the claim lives here beside the test that backs it and cannot be
 * edited in only one place. Both halves are needed: a declaration alone is an unbacked assertion, and
 * the spawn alone would not survive the files that drive their subjects through a helper.
 */
const DRIVES = ['scripts/probe-z-floor.mjs'];

const CORPUS_SIZE = (JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: unknown[] }).cases.length;

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const shipped = run([]);

describe('probe-z-floor · the reading', () => {
  it('takes a reading of the shipped corpus and exits 0, whatever the reading says', () => {
    // A probe that failed on the number it exists to report would be a gate wearing a probe's name:
    // both floors answer different questions, so a case that ranks differently between them is a fact
    // about the case rather than a defect in the corpus.
    expect(shipped.status, shipped.out).toBe(0);
  });

  it('reports one line per case in the corpus, so no case is silently skipped', () => {
    const lines = shipped.out.split('\n').filter((line) => /^(MOVED| {5}) history-/.test(line));
    expect(lines).toHaveLength(CORPUS_SIZE);
  });

  it('resolves every declared reading, and says so rather than leaving a NaN in the ranking', () => {
    // The probe's own bug, kept visible: the first version skipped `post: { parameter: … }` and the
    // two affected cases sorted into an arbitrary order and were reported as measurements.
    expect(shipped.out).toContain('0 unresolved reading(s)');
    expect(shipped.out).toContain('0 non-finite statistic(s)');
  });

  it('reports the corpus as independent of the floor, which is what its evidence rests on', () => {
    // The ratchet. `strict` is the only kind `checkDiscrimination` accepts, so a case moving into or
    // out of it under a different floor would mean the corpus's displacement evidence is a property of
    // the constant. If this fails, read the stderr line naming the case: the repair is an annotation
    // with variance in the baseline, not a wider tolerance here.
    expect(shipped.out, 'a case is strict under one floor and not the other').toContain(
      '0 of them into or out of strict',
    );
  });
});

describe('probe-z-floor · an input it cannot read', () => {
  it('refuses a corpus directory that is not one, rather than reporting zero cases', () => {
    // The failure site. Without it the probe would be a script whose only exit is success, which is
    // the shape `scripts-are-classified.test.ts` refuses to file as a probe.
    const empty = mkdtempSync(join(tmpdir(), 'probe-z-floor-'));
    dirs.push(empty);
    const result = run(['--cases', empty]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('could not read the case index');
  });

  it('refuses an argument it does not know, and explains itself on --help', () => {
    expect(run(['--nonsense']).out).toContain("unknown argument '--nonsense'");
    const help = run(['--help']);
    expect(help.status).toBe(0);
    expect(help.out).toContain('usage: node scripts/probe-z-floor.mjs');
  });
});
