import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every mutation battery is reachable, or this file says which one is not.
 *
 * ## The measurement that produced it
 *
 * Three batteries -- `fault-extraction-scoring.py`, `fault-extraction-workflow.py`
 * and `fetch-official-retry.py` -- had been written, repaired and given a restore
 * verdict, and **no package script and no workflow named any of them**. Running
 * `grep -l` over `package.json` and `.github/workflows/` returned nothing for all
 * three, while the other seven batteries matched in both places.
 *
 * The consequence is not that they were broken. It is that the repairs finding
 * 142 made to them -- each now returns a non-zero status when its own mutation is
 * left behind -- could only be verified by someone typing the path by hand, which
 * is why `batteries-verify-their-restore.test.ts` had to read them statically and
 * records a blind spot for one of them. A guard that cannot run its subject can
 * only describe it.
 *
 * ## The rule, and why it has no exemptions
 *
 * A file in `scripts/` whose job is to mutate a tracked source and require the
 * suite to notice is a battery, and a battery that nothing invokes cannot gate
 * anything. So every battery must be named by a `package.json` script -- so a
 * human can run exactly what CI runs -- and appear in a `run:` command in a
 * workflow, so a merge is decided by it.
 *
 * There is no exemption list, and that is the point. Seven of the ten satisfied
 * both halves before this file existed; the three that did not were wired rather
 * than excused, and the assertion is therefore an equality over the directory
 * instead of a subset over a hand-maintained list. Adding an eleventh battery
 * fails this file until it is reachable.
 *
 * ## What is deliberately not asserted
 *
 * Not that the battery passes -- only a run can say that, and CI says it by
 * running. Not that every script under `scripts/injection/` is a battery: the
 * subject is derived from the tree and the rule is applied to what it finds, so a
 * probe added there is held to it too. That is intentional; the failure this file
 * exists for was a battery, and a wider net catches the next one.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The batteries, as paths relative to the repository root. */
function batteries(): string[] {
  const topLevel = readdirSync(resolve(ROOT, 'scripts'))
    .filter((name) => name.startsWith('inject-') && name.endsWith('.mjs'))
    .map((name) => `scripts/${name}`);
  const nested = readdirSync(resolve(ROOT, 'scripts', 'injection'))
    .filter((name) => name.endsWith('.py'))
    .map((name) => `scripts/injection/${name}`);
  return [...topLevel, ...nested].sort();
}

/** The files a workflow is asked to run, one string per `run:` command. */
function runCommands(workflowText: string): string[] {
  return workflowText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('run:') || line.startsWith('- run:'))
    .map((line) => line.replace(/^-?\s*run:\s*/, ''));
}

function workflowTexts(): string[] {
  const dir = resolve(ROOT, '.github', 'workflows');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => readFileSync(join(dir, name), 'utf8'));
}

function packageScripts(): string[] {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return Object.values(manifest.scripts ?? {});
}

describe('every mutation battery reaches an invoker', () => {
  it('finds the batteries by reading the tree, not a list written here', () => {
    // The premise. A hand-written list would make this file assert its own
    // contents; the count is a lower bound so that a broken directory read cannot
    // turn the rule below into a vacuous pass over an empty set.
    const found = batteries();
    expect(found.length).toBeGreaterThanOrEqual(10);
    // And it is not one directory's worth: both shapes are present.
    expect(found.some((p) => p.startsWith('scripts/inject-'))).toBe(true);
    expect(found.some((p) => p.startsWith('scripts/injection/'))).toBe(true);
  });

  it('a `run:` command is what counts as an invocation, not a mention', () => {
    // The matcher's own control. Without this, a path named in a comment would
    // satisfy the rule -- which is how the three orphans could have been
    // "fixed" by writing their names into `ci.yml` prose.
    const text = [
      '# scripts/injection/pretend-battery.py is mentioned here only',
      '      - name: run the real one',
      '        run: python3 scripts/injection/real-battery.py',
    ].join('\n');
    const commands = runCommands(text);
    expect(commands).toEqual(['python3 scripts/injection/real-battery.py']);
    expect(commands.some((c) => c.includes('pretend-battery.py'))).toBe(false);
    expect(commands.some((c) => c.includes('real-battery.py'))).toBe(true);
  });

  it('names every battery in a package script, so a human runs what CI runs', () => {
    const scripts = packageScripts();
    const unwired = batteries().filter(
      (path) => !scripts.some((command) => command.includes(path)),
    );
    expect(
      unwired,
      'these batteries are not in any package.json script, so the command CI '
        + 'would run is not one anyone can reproduce locally',
    ).toEqual([]);
  });

  it('routes every battery through a workflow, so a merge is decided by it', () => {
    const commands = workflowTexts().flatMap(runCommands);
    expect(commands.length, 'no workflow has any run command').toBeGreaterThan(10);
    const unreached = batteries().filter(
      (path) => !commands.some((command) => command.includes(path)),
    );
    expect(
      unreached,
      'these batteries exist, are green by hand, and no workflow runs them -- so '
        + 'nothing they prove is verified by the pipeline that decides a merge',
    ).toEqual([]);
  });

  it('names the three that were orphans, so unwiring one is red and specific', () => {
    // The positive control, pinned to the finding rather than to a rule: the
    // three repaired under finding 142 and wired under this one. If any is
    // removed from the pipeline this assertion names it, rather than leaving the
    // general rule above to report an anonymous list.
    const commands = workflowTexts().flatMap(runCommands);
    const wereOrphans = [
      'scripts/injection/fault-extraction-scoring.py',
      'scripts/injection/fault-extraction-workflow.py',
      'scripts/injection/fetch-official-retry.py',
    ];
    for (const path of wereOrphans) {
      expect(
        commands.some((command) => command.includes(path)),
        `${path} was one of three batteries nothing invoked; it is not invoked now`,
      ).toBe(true);
    }
  });
});
