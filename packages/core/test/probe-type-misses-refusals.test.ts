import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DEFAULT_RUN,
  REPO,
  RUNS,
  readSamplesCorpus,
  recordedCategoryMisses,
  recordedTypeMisses,
  runBody,
} from '../../../scripts/type-miss-readings.mjs';

/**
 * The two refusals `probe-type-misses.mjs` published and no run had ever entered.
 *
 * ## What the census found, and what the sentence explaining it turned out to be
 *
 * v3.46 instrumented every `throw` in the tree and asked, of each, whether any test
 * had ever executed the line. Three in this probe answered no. Each carried the
 * same sentence: *the same check as a proved line above them, in a block that runs
 * later, so these cannot be the one that reports.*
 *
 * The sentence is true, and reading it as an excuse hid what it was describing. A
 * check that another check always fires first is a check that was **written twice**.
 * Measured, all three were exactly that:
 *
 *  - `recordedTypeMisses` and `recordedCategoryMisses` each held their own copy of
 *    "this run is not in the table" -- same map, same key, same message;
 *  - `categoryEvidence`, `denialEvidence` and `derivationEvidence` each held their
 *    own copy of "this corpus carries no `samples` array" -- **on the same file**,
 *    since all three resolve to `golden-master/fault-extraction/samples.json`, two
 *    of them through paths built inline and one through `DATASET`.
 *
 * So the honest repair was not to write a test that reaches the copy behind the
 * first one -- it was to delete the copies. Three duplicate guards became two
 * single ones, the inventory went from 41 throw statements to 38, and the rows that
 * used to rest on a sentence are now rows a run enters.
 *
 * ## Why they were unreachable, and why the repair is a module rather than a test
 *
 * Both were unreachable for the same reason: the guard's input was a constant. The
 * run name could only be one `main` had already validated, and the corpus path was
 * fixed at the top of the file -- so the arm that refuses a corpus without
 * `samples` could only fire on a file nobody has, which is the definition of a guard
 * that is not doing any work.
 *
 * The two guards now live in `type-miss-readings.mjs` and **take what they read**:
 * `runBody(run)` takes the run name, `readSamplesCorpus(path)` takes the path. That
 * also puts them in a `data` module, which is where they have to be: a test may not
 * import a probe, because `verify-gates-are-testable.mjs` proves a probe by emptying
 * it and an import would kill the worker before vitest could name the failure.
 *
 * ## The control each assertion carries
 *
 * Every refusal is asserted beside the input the same function is supposed to
 * accept. A message check alone is satisfied by a function that throws
 * unconditionally, and an unconditional throw is not a guard -- it is a wall, and
 * the battery would find nothing in it to defend.
 */

const scratch = mkdtempSync(join(tmpdir(), 'type-miss-refusals-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('the refusals the type-miss readings publish', () => {
  it('refuses a run it has not recorded, naming the runs it has', () => {
    // The message is built from `RUNS` rather than written out, so it cannot list a
    // run the map does not hold. Both recorded runs are asserted by name because a
    // message that lists one of two is the shape a stale copy takes.
    const expected = new RegExp(Object.keys(RUNS).join(', '));
    expect(() => runBody('not-a-recorded-run')).toThrow(/unknown run 'not-a-recorded-run'/);
    expect(() => runBody('not-a-recorded-run')).toThrow(expected);

    // Control: a run the table does hold, returning rows rather than raising, and a
    // default that is one of the runs rather than a fourth name.
    const rows = runBody(DEFAULT_RUN);
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(RUNS)).toContain(DEFAULT_RUN);
    // And the two readings over one body really are two filters on one parse: every
    // `category` row of the run appears in the category reading, and no `type` row
    // does -- which is what the shared reader bought.
    const categories = recordedCategoryMisses(DEFAULT_RUN);
    expect(categories.length).toBeGreaterThan(0);
    for (const row of categories) expect(row.field).toBe('category');
    expect(recordedTypeMisses(DEFAULT_RUN).rows.length).toBeGreaterThan(0);
  });

  it('refuses a corpus that carries no samples array, and names the file it read', () => {
    const path = join(scratch, 'no-samples.json');
    writeFileSync(path, JSON.stringify({ note: 'a corpus that carries no samples array' }));
    // The path in the message is the path passed in, which is what makes this a
    // measurement of the argument rather than of a constant.
    expect(() => readSamplesCorpus(path)).toThrow(`${path} carries no samples array`);

    // Control: the shipped corpus parses and has the array the readers index.
    const shipped = readSamplesCorpus(resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json'));
    expect(Array.isArray(shipped.samples)).toBe(true);
    expect(shipped.samples.length).toBeGreaterThan(0);
  });

  it('holds no duplicate of either refusal in the probe that prints them', () => {
    // The finding stated as a source fact, because the inventory can only report
    // what exists: the probe must not have grown a fourth copy of a check it no
    // longer owns. This is the assertion that would have caught the three copies in
    // the first place, and it is cheap enough to keep.
    const probe = readFileSync(resolve(REPO, 'scripts', 'probe-type-misses.mjs'), 'utf8');
    expect(probe).not.toMatch(/carries no samples array/);
    expect(probe).not.toMatch(/unknown run '/);
    // The probe still reads the fixture, but through one function rather than three
    // inline `RUNS[…]` lookups.
    expect(probe).not.toMatch(/fixtures', RUNS\[/);
    expect(dirname(resolve(REPO, 'scripts', 'type-miss-readings.mjs'))).toBe(resolve(REPO, 'scripts'));
  });
});
