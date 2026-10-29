import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  installedSetupFiles,
  resolveEntry,
  setupFileEntries,
} from './support/installed-setup-files.js';

/**
 * The stopwatch is installed, and not merely available.
 *
 * ## What this file is for
 *
 * `stall-budget.test.ts` establishes that the gauge works and that the hook can
 * fail a run: it builds a two-case project, points its `setupFiles` at
 * `test/setup/stall-watch.ts`, and asserts the blocking case fails while the
 * awaited one passes. Every one of those assertions holds if the line that
 * installs the hook in **this** package is deleted.
 *
 * The hook lives in a config file, and a config file is the one place in a
 * repository where a deletion is invisible: nothing imports it, so the module
 * graph does not notice; every test still runs, so the counts do not notice; and
 * the only artefact that would have changed -- an attribution of a stall to a
 * file -- is produced no more, silently. Delete `setupFiles` from
 * `packages/core/vitest.config.ts` and the suite is green with 4 816 tests while
 * the instrument that v3.12 added has stopped existing. That is the same shape as
 * the defect it was added for: a run that is green because nothing was measured.
 *
 * ## Why the proof is the battery, not this file
 *
 * A test that the config *mentions* a path would pass on a config that names the
 * wrong path, a path that no longer exists, or a hook whose body no longer throws.
 * So the properties below are layered, each one holding a different link:
 *
 * 1. the config installs exactly one setup file, and it exists;
 * 2. that file is a hook -- it registers an `afterAll`, it reads its budget from
 *    the support module, and it throws when the gauge reports a verdict;
 * 3. the battery runs the file the config installs rather than a copy of its path,
 *    so a deleted entry makes the battery's blocking case pass, which fails the
 *    battery.
 *
 * Link 3 is the one that makes the installation load-bearing: the gauge stops
 * existing, and something goes red about it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE_CONFIG = resolve(ROOT, 'packages', 'core', 'vitest.config.ts');
const HOOK = resolve(ROOT, 'packages', 'core', 'test', 'setup', 'stall-watch.ts');
const BATTERY = resolve(ROOT, 'packages', 'core', 'test', 'stall-budget.test.ts');

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-setup-files-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A config file on disk, for the cases that are about reading one. */
function config(name: string, body: string): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'vitest.config.ts');
  writeFileSync(path, body);
  return path;
}

const ARRAY_FORM = [
  "import { defineConfig } from 'vitest/config';",
  'export default defineConfig({',
  '  test: {',
  "    // A comment before the key, because the real config carries one.",
  "    setupFiles: ['./test/setup/stall-watch.ts'],",
  '  },',
  '});',
  '',
].join('\n');

describe('setup files · what a config declares', () => {
  it('reads the array form, and the entries in the order they are written', () => {
    const scan = setupFileEntries(ARRAY_FORM);

    expect(scan.problems).toEqual([]);
    expect(scan.entries).toEqual(['./test/setup/stall-watch.ts']);
  });

  it('reads the string form, which vitest accepts as one entry', () => {
    const scan = setupFileEntries("export default { test: { setupFiles: \"./a.ts\" } };\n");

    expect(scan.problems).toEqual([]);
    expect(scan.entries).toEqual(['./a.ts']);
  });

  it('reads past a line comment inside the array', () => {
    const scan = setupFileEntries(
      ['export default { test: {', '  setupFiles: [', '    // why this one is here', "    './a.ts',", '  ],', '} };'].join(
        '\n',
      ),
    );

    expect(scan.problems).toEqual([]);
    expect(scan.entries).toEqual(['./a.ts']);
  });

  it('refuses a config that installs nothing, which is the deleted line', () => {
    // The shape of the defect: the module still exists, the tests still pass, and
    // the sentence that installed it is gone. Reading nothing is not the same as
    // reading nothing to complain about.
    const scan = setupFileEntries("export default { test: { coverage: { provider: 'v8' } } };\n");

    expect(scan.entries).toEqual([]);
    expect(scan.problems.join('\n')).toContain('installs no setup file');
  });

  it('refuses an empty array, which reads as installed to a grep', () => {
    const scan = setupFileEntries('export default { test: { setupFiles: [] } };\n');

    expect(scan.problems.join('\n')).toContain('list is empty');
  });

  it('refuses two declarations, because vitest uses one and a reader reads the other', () => {
    const scan = setupFileEntries(
      ['export default { test: {', "  setupFiles: ['./a.ts'],", "  setupFiles: ['./b.ts'],", '} };'].join('\n'),
    );

    expect(scan.problems.join('\n')).toContain('more than one `setupFiles`');
  });

  it('refuses an entry it cannot read without running the config', () => {
    // A computed entry is not wrong, but it is unverifiable here, and a check that
    // silently skipped it would report "one entry" for a config it never read.
    const scan = setupFileEntries(
      ['const files = ["./a.ts"];', 'export default { test: { setupFiles: files } };'].join('\n'),
    );

    expect(scan.problems.join('\n')).toContain('not a list of string literals');
  });

  it('refuses an entry that resolves to nothing', () => {
    const path = config('missing', "export default { test: { setupFiles: ['./gone.ts'] } };\n");

    const scan = installedSetupFiles(path);

    expect(scan.problems.join('\n')).toContain('does not exist');
    expect(scan.resolved).toEqual([]);
  });

  it('resolves an entry against the config\'s own directory, not the working directory', () => {
    const path = config('present', "export default { test: { setupFiles: ['./hook.ts'] } };\n");
    writeFileSync(join(dirname(path), 'hook.ts'), 'export {};\n');

    const scan = installedSetupFiles(path);

    expect(scan.problems).toEqual([]);
    expect(scan.resolved).toEqual([join(dirname(path), 'hook.ts')]);
  });

  it('refuses a directory, which exists and installs nothing', () => {
    const path = config('directory', "export default { test: { setupFiles: ['./hooks'] } };\n");
    mkdirSync(join(dirname(path), 'hooks'), { recursive: true });

    expect(resolveEntry(path, './hooks').problem).toContain('not a file');
  });
});

describe('setup files · this package installs the stopwatch', () => {
  it('installs exactly one setup file, and it is the stall watch', () => {
    const scan = installedSetupFiles(CORE_CONFIG);

    expect(scan.problems).toEqual([]);
    // One entry rather than "contains": a second setup file would be a second
    // place the suite's behaviour is altered, and this assertion is the one that
    // makes a reader look at it.
    expect(scan.entries).toEqual(['./test/setup/stall-watch.ts']);
    expect(scan.resolved).toEqual([HOOK]);
    expect(basename(scan.resolved[0]!)).toBe('stall-watch.ts');
  });

  it('installs a hook that registers, budgets and throws', () => {
    const source = readFileSync(HOOK, 'utf8');

    // Registration: a setup file that runs no `afterAll` measures and reports
    // nothing, whatever else it contains.
    expect(source).toMatch(/\bafterAll\(/);
    // The budget is the support module's, not a number written here. A literal
    // would let the hook and the calibration drift while both looked right.
    expect(source).toMatch(/budgetFromEnvironment\(/);
    expect(source).not.toMatch(/45_?000/);
    // And a verdict is thrown rather than logged: a `console.error` in a setup
    // file leaves the exit code at zero, which is the exact failure mode the whole
    // instrument exists to end.
    expect(source).toMatch(/if \(verdict !== undefined\) throw new Error\(verdict\)/);
  });

  it('is installed by the battery rather than copied into it', () => {
    // The battery used to spell `packages/core/test/setup/stall-watch.ts` itself,
    // which is why deleting the config line changed nothing. It now reads the
    // path from the config, so its two cases are a proof about *this* suite's
    // installation rather than about a file it happens to name. The prose in its
    // header may still say `setup/stall-watch.ts` -- that is a reader being told
    // where the hook lives; what may not appear is the path a `setupFiles` entry
    // needs, because that is the config's to write.
    const source = readFileSync(BATTERY, 'utf8');

    expect(source).not.toContain('packages/core/test/setup/stall-watch');
    expect(source).toContain('installedSetupFiles');
  });
});
