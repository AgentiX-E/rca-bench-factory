import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared.
 */
const DRIVES = ['scripts/check-user-guide.mjs'];

/**
 * `scripts/check-user-guide.mjs` runs the walkthrough's commands.
 *
 * The guide's opening sentence claims something checkable -- *"Every command and
 * every output block below is real ... and can be run verbatim from the
 * repository root"* -- and until the gate existed nothing executed any of the
 * `bash` blocks. That is this campaign's recurring defect: a published claim
 * with no reader. `check-readme-sample.mjs` covers the README for the same
 * reason; the guide was the sibling never covered.
 *
 * ## What the gate observed, and why the first answer was "correct" by accident
 *
 * The gate's first version extracted every column-zero ```bash fence and ran it,
 * and it passed. That pass was not evidence. Three separate problems were hiding
 * behind it, and all three are this campaign's recurring defect -- a claim that
 * is published and that nothing reads:
 *
 *   1. **A fence that lies about being runnable.** The round-trip section is
 *      prose that spells `rca-bench ingest ...` and a commented-out output line.
 *      It was tagged ```bash, so the gate concatenated it into the walkthrough
 *      and it happened to run. The tag was a claim no one checked.
 *   2. **A fence that documents a shape, not a step.** `official --target
 *      openrca-1.0 --dir ./out/openrca-1.0` names a directory the walkthrough
 *      never creates. It passed only if some *earlier, unrelated* run had left
 *      one behind -- which is ordering contamination, not correctness.
 *   3. **A fence that was invisible.** The extractor anchored on `^` with no
 *      allowance for indentation, so the round-trip fence -- nested inside a
 *      numbered list, indented three spaces -- matched nothing. It was neither
 *      executed nor counted, so it did not appear even in the census that exists
 *      to make omissions visible.
 *
 * The gate now treats the fence tag as the contract in both directions: ```bash
 * must be executable and is executed; ```text is the honest tag for an
 * illustration, and those blocks say in prose why they are not runnable. The
 * census prints every language and its count, so re-tagging a runnable fence is
 * a visible change to the gate's output rather than a silent loss of coverage.
 *
 * ## Why the failure cases are forced in a throwaway tree
 *
 * `docs:check` runs the gate against the real guide on every push, so the happy
 * path is observed constantly. That proves the commands run; it proves nothing
 * about whether the gate would *refuse* a guide whose commands had drifted,
 * because the real guide does not drift inside a green run. A guard whose
 * failure branch is never entered is a guard taken on trust.
 *
 * The gate resolves its document from its own location and runs the commands
 * with the repository as the working directory, so a copy of the script inside a
 * throwaway tree reads *that* tree's document while still resolving the CLI and
 * the example inputs through the symlinked `packages/` and `examples/`. Those
 * symlinks are what keep the fixture honest: the commands run against the real
 * build, so a wrong flag fails for the real reason and not because the fixture
 * was hollow.
 *
 * A tree is also where the reset behaviour is observable. The gate removes the
 * outputs the guide itself creates (`out/`, `bundle.json`, `report.html`) before
 * running, so its verdict cannot depend on what a previous run left behind. The
 * test that covers this asserts the *absence* of the leftovers afterwards, which
 * is the only way to tell "the gate cleaned up" apart from "the fixture happened
 * to start clean" -- see `clears the outputs the guide itself creates`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'check-user-guide.mjs';
const GUIDE = resolve(ROOT, 'docs', 'user-guide.md');

/**
 * The fence extractor, matching the gate's.
 *
 * Deliberately a copy rather than an import: the point of this helper is to be
 * an *independent* count of what the document carries. Importing the gate's own
 * function would make the comparison a tautology -- the self-reference trap, an
 * enumeration gate whose list is drawn from the thing it enumerates. It is
 * written to allow leading whitespace because the gate's first version did not,
 * and that omission is the bug this file now guards.
 */
function bashFenceCount(markdown: string): number {
  return [...markdown.matchAll(/^[ \t]*```bash[ \t]*\r?\n[\s\S]*?^[ \t]*```[ \t]*$/gm)].length;
}

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-userguide-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate and a document, linked to the real build.
 *
 * The copy sits two levels down (`<tree>/scripts/…`) because that is the depth
 * the gate's own `resolve(…, '..')` expects. `packages/`, `node_modules/` and
 * `examples/` are symlinked rather than copied: the commands under test invoke
 * the built CLI and read the shipped example inputs, and copying either would
 * put a second, drifting copy of the subject inside the fixture.
 */
function treeWith(docName: string, doc: string): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'docs'), { recursive: true });
  copyFileSync(resolve(ROOT, 'scripts', SCRIPT), join(tree, 'scripts', SCRIPT));
  writeFileSync(join(tree, 'docs', docName), doc);
  for (const link of ['packages', 'node_modules', 'examples']) {
    symlinkSync(resolve(ROOT, link), join(tree, link), 'dir');
  }
  return tree;
}

function run(tree: string, docName = 'user-guide.md'): Outcome {
  const result = spawnSync(
    process.execPath,
    [join(tree, 'scripts', SCRIPT), '--doc', join(tree, 'docs', docName)],
    { encoding: 'utf8', cwd: tree, timeout: 600_000 },
  );
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** A document holding exactly the bash blocks given, as the gate requires. */
function guideWithBlocks(...blocks: string[]): string {
  return ['# Guide', '', 'Prose.', '', ...blocks.flatMap((b) => ['```bash', b, '```', '']), ''].join('\n');
}

/** A document holding one fenced block of an arbitrary language. */
function guideWithFenced(tag: string, body: string): string {
  return ['# Guide', '', 'Prose.', '', '```' + tag, body, '```', ''].join('\n');
}

/**
 * `expectFailedForOwnReason`, as `check-no-absolute-paths.test.ts` defines it.
 *
 * Asserting the exit code alone is the false-green idiom this repository has
 * recorded more than once: a script that crashes on a missing import also exits
 * non-zero, and would be indistinguishable from the guard firing. So every
 * negative asserts the gate's own verdict text and that Node did not fail on the
 * way there.
 */
function expectFailedForOwnReason(outcome: Outcome): void {
  expect(outcome.status).toBe(1);
  expect(outcome.stderr).toContain('check-user-guide: FAILED');
  expect(outcome.stderr).not.toMatch(/Cannot find module/);
  expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
}

/**
 * The time the shared gate run below is allowed.
 *
 * This is the file's stated budget, and it is a budget for a **hook** rather than
 * for a test, which is why it is not a third argument to an `it`.
 *
 * The run used to happen at module load, as a top-level IIFE. Measured, that put
 * **3.5 s of the file's 4.9 s into collection**: the spawn executed while the
 * module graph was still being evaluated, so vitest's per-test timeout never
 * applied to it. A probe confirms the mechanism rather than assuming it -- a
 * 7-second `spawnSync` at module load reports `collect 7.04s, tests 2ms`, and a
 * `{ timeout: 200 }` on the test beside it does not fire. The cost was real and
 * completely unbounded.
 *
 * A `beforeAll` is where a one-time setup cost belongs, and `hookTimeout` is the
 * number that governs it, so the work is now both measured and capped. The value
 * is 60 s for the same reason as `BULK_TIMEOUT_MS` in
 * `check-official-roundtrip.test.ts`: an order of magnitude over the observed
 * cost is a budget, and twice the observed cost is the flake again wearing a
 * larger number. The guide is a walkthrough of the real CLI, so its cost tracks
 * the machine; the bound exists to catch a hang, not to be approached.
 */
const GUIDE_RUN_TIMEOUT_MS = 60_000;

/**
 * The gate's verdict on the real tree, computed **once** for the whole file.
 *
 * Three assertions below read this one run rather than each spawning the gate.
 * That is not an optimisation -- spawning it three times was a **race**. The gate
 * deletes `out/`, `bundle.json` and `report.html` before running, so three
 * concurrent invocations against the same repository root delete each other's
 * output mid-run. It passed when this file ran alone and failed two assertions in
 * a full-suite run, which is the worst way for a test to be wrong: the failure
 * looks like the gate's and is actually the harness's.
 *
 * Spawning once removes the contention rather than widening a timeout to survive
 * it. The run is shared because the *subject* is shared -- there is one guide and
 * one repository root, so a second identical run tells the caller nothing the
 * first did not.
 *
 * `let` rather than `const` because the spawn moved into `beforeAll`; it is still
 * exactly one run per file.
 */
let liveRun: Outcome;

beforeAll(() => {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', SCRIPT)], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: GUIDE_RUN_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    liveRun = { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
    return;
  }
  liveRun = { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}, GUIDE_RUN_TIMEOUT_MS);

describe('scripts/check-user-guide.mjs · the walkthrough is executed', () => {
  it('runs every bash block in the shipped guide, and the guide passes', () => {
    // The live assertion. It is the gate's own job, run here so a failure names
    // this file rather than appearing only inside `docs:check`.
    //
    // The gate is spawned from `ROOT` with no `--doc`, so it resolves the real
    // guide and resets the real `out/` before running. That reset is why this
    // test is deterministic: an earlier version of this file observed the gate
    // exiting 1 on a tree where a previous partial run had left `out/` behind, and
    // exiting 0 from a clean tree. A test that depends on the machine's history is
    // not a test -- and the shared `liveRun` above is what keeps the history from
    // being written by two tests at once.
    if (liveRun.status !== 0) {
      throw new Error(`check-user-guide.mjs failed on the shipped guide:\n${liveRun.stdout}\n${liveRun.stderr}`);
    }
    expect(liveRun.stdout).toMatch(/check-user-guide: OK \(\d+ bash block\(s\) executed in order\)/);
  });

  it('counts the blocks it ran, and the count is the guide\'s count', () => {
    // A gate that extracted fewer blocks than the document carries would pass
    // while checking less than it claims, so the two are compared. Read from the
    // document rather than hard-coded, because a hard-coded number would have to
    // be edited whenever the guide gained a step -- and the edit is the check.
    //
    // `bashFenceCount` allows leading whitespace, which is the fix for the
    // invisible-fence bug: the guide carries a fence nested inside a numbered
    // list, and the gate's first extractor -- anchored on `^` with no
    // indentation allowance -- matched neither it nor anything else indented.
    const markdown = readFileSync(GUIDE, 'utf8');
    const fences = bashFenceCount(markdown);
    expect(fences).toBeGreaterThan(0);
    expect(liveRun.stdout).toContain(`${fences} bash block(s)`);
  });

  it('reports the fence census, so a re-tagged fence cannot shrink coverage in silence', () => {
    // The enumeration-gate trap. The gate keys on the language tag, so moving a
    // fence from ```bash to anything else removes it from execution *and* from
    // the count -- and the gate would still print OK. The census makes the tag
    // change visible in the gate's own output.
    //
    // The numbers are read from the document rather than pinned, so this test
    // survives the guide gaining a snippet while still failing if the census
    // stops agreeing with the document.
    const markdown = readFileSync(GUIDE, 'utf8');
    // Opening fences carry an info string; closing fences carry none. Counting
    // the two separately is what makes the census self-checking: every opening
    // fence must be counted under some language, and the openings must outnumber
    // the closings by exactly zero.
    const openings = [...markdown.matchAll(/^[ \t]*```(\S+)[ \t]*$/gm)].map((m) => m[1]);
    const closings = [...markdown.matchAll(/^[ \t]*```[ \t]*$/gm)].length;
    expect(openings.length).toBe(closings);

    expect(liveRun.status).toBe(0);

    const census = new Map<string, number>();
    for (const tag of openings) census.set(tag, (census.get(tag) ?? 0) + 1);
    const reported = /check-user-guide: fences (.+)$/m.exec(liveRun.stdout)?.[1] ?? '';
    const reportedTags = reported.split(/\s+/).filter((part) => part !== '');
    // The census must name every language the document carries, with the same
    // count -- no more (an invented language) and no fewer (a skipped one).
    for (const [tag, n] of census) expect(reportedTags).toContain(`${tag}=${n}`);
    expect(reportedTags).toHaveLength(census.size);
    // And the runnable count must be the bash count, which is the number the
    // gate claims to have executed.
    expect(reportedTags).toContain(`bash=${census.get('bash')}`);
  });

  it('clears the outputs the guide itself creates, so the verdict is not history-dependent', () => {
    // The ordering-contamination finding. A stale `out/` from an earlier partial
    // run made `official --dir ./out/...` fail for a reason unrelated to the
    // document. The gate now removes the paths the guide itself writes before
    // running; this asserts they are gone *afterwards*, which is the only way to
    // distinguish "the gate cleaned up" from "the fixture started clean".
    const tree = treeWith('good.md', guideWithBlocks(
      'node packages/cli/dist/main.js source --path examples/order-prod/metrics.csv --signal-kind metric --assume-offset-minutes 480',
    ));
    // Plant the leftovers a partial run would leave, then observe the gate
    // remove them. Without the reset the gate would run with these present.
    mkdirSync(join(tree, 'out'), { recursive: true });
    writeFileSync(join(tree, 'out', 'stale.txt'), 'left over from an earlier run');
    writeFileSync(join(tree, 'bundle.json'), '{}');
    const outcome = run(tree, 'good.md');
    expect(outcome.status).toBe(0);
    expect(existsSync(join(tree, 'out'))).toBe(false);
    expect(existsSync(join(tree, 'bundle.json'))).toBe(false);
  });

  it('executes a bash fence that is indented inside a list item', () => {
    // The invisible-fence regression. A fence nested in a numbered list is
    // indented by the marker's width; the gate's first extractor matched only
    // column-zero fences, so such a block was neither run nor counted. Here a
    // *broken* command sits in an indented fence: if the gate still missed it,
    // the document would pass, so this test fails exactly when the bug returns.
    counter += 1;
    const tree = join(scratch, `tree-${counter}`);
    mkdirSync(join(tree, 'scripts'), { recursive: true });
    mkdirSync(join(tree, 'docs'), { recursive: true });
    copyFileSync(resolve(ROOT, 'scripts', SCRIPT), join(tree, 'scripts', SCRIPT));
    writeFileSync(
      join(tree, 'docs', 'indented.md'),
      ['# Guide', '', 'Prose.', '', '1. A step whose command is nested:', '', '   ```bash', '   node packages/cli/dist/main.js definitely-not-a-command', '   ```', '', ''].join('\n'),
    );
    for (const link of ['packages', 'node_modules', 'examples']) {
      symlinkSync(resolve(ROOT, link), join(tree, link), 'dir');
    }
    const outcome = run(tree, 'indented.md');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('a command in');
  });

  it('refuses a command the CLI does not implement', () => {
    // The drift the gate was built for, and the exact shape of the README defect
    // it mirrors: a documented flag that the binary does not have. A guide can
    // say anything; only running it decides.
    const tree = treeWith('drifted.md', guideWithBlocks(
      'node packages/cli/dist/main.js source \\\n  --path examples/order-prod/metrics.csv \\\n  --signal-kind metric \\\n  --assume-offset 480',
    ));
    const outcome = run(tree, 'drifted.md');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toMatch(/Unknown option/);
    expect(outcome.stderr).toContain('a command in');
  });

  it('refuses a document that carries no bash block, rather than passing vacuously', () => {
    // The vacuity guard. Extraction that stops matching would otherwise report
    // success while checking nothing -- the state this project calls a gate that
    // is neither a threshold nor an enumeration.
    const tree = treeWith('empty.md', '# Guide\n\n```shell\nnode x\n```\n');
    const outcome = run(tree, 'empty.md');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('no ```bash block found');
    expect(outcome.stderr).toContain('Reporting success on zero blocks');
  });

  it('names the step that failed, so the reader is not sent to a generated file', () => {
    const tree = treeWith('named.md', guideWithBlocks(
      'node packages/cli/dist/main.js source --path examples/order-prod/metrics.csv --signal-kind metric --assume-offset-minutes 480',
      'node packages/cli/dist/main.js definitely-not-a-command',
    ));
    const outcome = run(tree, 'named.md');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('--- step 2 of 2 ---');
  });

  it('stops at the first failing step instead of reporting later ones as fine', () => {
    // `set -e`. Without it the script would run on, and a later step could exit
    // 0 while an earlier one had failed -- a session that looks like a
    // walkthrough but skipped its own middle.
    const tree = treeWith('stops.md', guideWithBlocks(
      'node packages/cli/dist/main.js definitely-not-a-command',
      'echo "THIS MUST NOT RUN"',
    ));
    const outcome = run(tree, 'stops.md');
    expectFailedForOwnReason(outcome);
    expect(outcome.stdout).not.toContain('THIS MUST NOT RUN');
  });

  it('fails when the document is absent rather than treating it as empty', () => {
    const tree = treeWith('present.md', guideWithBlocks('echo ok'));
    const outcome = run(tree, 'absent.md');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('does not exist');
  });

  it('runs a good block in the repository root, where the guide says it can be run', () => {
    // The positive control for every negative above: the same harness, a
    // document whose commands are real, and the gate accepts it. Without this,
    // a gate that failed on everything would satisfy all the tests above.
    const tree = treeWith('good.md', guideWithBlocks(
      'node packages/cli/dist/main.js source \\\n  --path examples/order-prod/metrics.csv \\\n  --signal-kind metric \\\n  --assume-offset-minutes 480',
    ));
    const outcome = run(tree, 'good.md');
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('check-user-guide: OK (1 bash block(s) executed in order)');
  });
});
