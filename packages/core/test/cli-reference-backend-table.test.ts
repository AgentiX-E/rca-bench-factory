import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement in
 * either direction. The declaration is needed because this file drives the gate
 * through a `run(tree)` helper, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = ['scripts/check-cli-reference.mjs'];

/**
 * The `pull` section's per-backend table, in a file of its own.
 *
 * ## Why this is not in `check-cli-reference.test.ts`
 *
 * Every case here spawns the gate, and the gate imports core's built
 * `dist/index.js`, so one case costs about 2.3 seconds. Five more cases in the
 * file that already had nine took that file from ~21 s of serial work to ~32 s,
 * and CI failed with
 *
 *     [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * while **every test passed** -- `Test Files 140 passed`, `Tests 3756 passed`,
 * `Errors 1 error`. Vitest exits non-zero for an unhandled error even when the
 * suite is green, and locally the same run passed.
 *
 * ## What this file got wrong about why, and what replaced it
 *
 * The paragraph above used to continue: *"the worker's RPC to the main process
 * timed out under the accumulated update traffic **... Splitting the file is the
 * fix rather than widening a timeout**"*. Both halves were wrong.
 *
 * The timeout is not about traffic. `onTaskUpdate` is a call the worker makes to
 * the main process over a bridge whose deadline is 60 s, and the deadline is
 * measured by a timer **in the worker**. A file whose children are spawned
 * synchronously blocks the worker's own event loop, so the loop never reaches the
 * timers phase to notice that the answer arrived long ago; when it finally does,
 * the first thing it sees is an expired timer. v3.12 established that with a
 * controlled pair rather than by reading: nine seven-second synchronous `sleep`
 * children in one file reproduce this exact error with every test passing, and the
 * same nine children `await`ed do not. The split therefore fixed nothing -- it
 * halved the blocking window, so the same file grew back past the deadline two
 * rounds later, which is what CI run `40886479390` reported.
 *
 * The two files now wait for their children (`execFile`) instead of blocking on
 * them, which removes the blocking rather than the budget it was spending. The
 * split is kept because two files still run in parallel and cost nothing, not
 * because it was the fix. `docs/audit/volume-09.md` records the pair, and
 * `stall-budget.test.ts` measures the property that replaced this one.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'check-cli-reference.mjs';
const REFERENCE = resolve(ROOT, 'docs/cli-reference.md');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-cliref-table-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate and a `docs/cli-reference.md` the caller
 * writes, with the real CLI linked in.
 *
 * The link points at `packages/`, whose `cli/dist/main.js` is the shipped binary.
 * `node_modules/` comes along because the CLI resolves `core`, whose own
 * dependencies resolve from there.
 */
function treeWith(functionalReference: string): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'docs'), { recursive: true });
  writeFileSync(join(tree, 'scripts', SCRIPT), readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8'));
  writeFileSync(join(tree, 'docs', 'cli-reference.md'), functionalReference);
  symlinkSync(resolve(ROOT, 'packages'), join(tree, 'packages'), 'dir');
  symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  return tree;
}

/** One child, as an `Outcome`, whether it exited or failed to start. */
function runNode(args: string[], cwd: string): Promise<Outcome> {
  return new Promise<Outcome>((settle) => {
    // `execFile` rather than a synchronous spawn: see the header. `promisify` is
    // deliberately not used, because rule 7 of `gate-sites-are-proven.test.ts`
    // reads these calls to infer which scripts this file drives.
    execFile(process.execPath, args, { encoding: 'utf8', cwd }, (error, stdout, stderr) => {
      if (error === null) {
        settle({ status: 0, stdout, stderr });
        return;
      }
      const code = (error as { code?: unknown }).code;
      settle({
        status: typeof code === 'number' ? code : -1,
        stdout,
        stderr: typeof code === 'number' ? stderr : error.message,
      });
    });
  });
}

function run(tree: string): Promise<Outcome> {
  return runNode([join(tree, 'scripts', SCRIPT)], tree);
}

/** The commands the real binary advertises, read from its own `--help`. */
async function advertisedTopics(): Promise<string[]> {
  const help = (await runNode([resolve(ROOT, 'packages/cli/dist/main.js'), '--help'], ROOT)).stdout;
  const section = help.split('Commands:')[1]?.split('\n\n')[0] ?? '';
  return [...section.matchAll(/^ {2}([a-z][\w-]*)\s{2,}\S/gm)]
    .map((m) => m[1]!)
    .filter((c) => c !== 'help' && c !== 'version');
}

/**
 * A reference document that the gate accepts, built around a given command list.
 *
 * The flag lists are read from each command's real `--help` rather than invented,
 * so the only thing the caller varies is the *structure*.
 */
async function referenceFor(topics: string[]): Promise<string> {
  const lines = ['# CLI reference', '', '## Implemented commands', '', '| Command | What it does |', '| --- | --- |'];
  for (const topic of topics) lines.push(`| \`${topic}\` | a command |`);
  lines.push('');
  for (const topic of topics) {
    lines.push(`### \`rca-bench ${topic}\``, '');
    const help = (await runNode([resolve(ROOT, 'packages/cli/dist/main.js'), topic, '--help'], ROOT)).stdout;
    const flags = [...help.matchAll(/^ {2}(--[\w-]+)/gm)].map((m) => m[1]!);
    lines.push(`Flags: ${flags.map((f) => `\`${f}\``).join(', ')}`, '');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The `pull` section's per-backend table, copied out of the committed reference.
 *
 * The input is the **document**, not the code: the table under test is the one a
 * reader follows, and generating it from `PULL_BACKEND_FLAGS` would make every
 * test below a restatement of the thing it is supposed to check. The positive
 * control is the committed table itself; each negative mutates one row of it.
 */
function committedPullTable(): string {
  const document = readFileSync(REFERENCE, 'utf8');
  const section = document.split('### `rca-bench pull`')[1]?.split(/^### /m)[0] ?? '';
  const lines = section.split('\n');
  const header = lines.findIndex((l) => /\|\s*Required\s*\|/.test(l) && /\|\s*Optional\s*\|/.test(l));
  if (header === -1) throw new Error('the committed reference has no per-backend table in its pull section');
  const rows = [lines[header]!];
  for (let i = header + 1; i < lines.length; i += 1) {
    if (!lines[i]!.trim().startsWith('|')) break;
    rows.push(lines[i]!);
  }
  // Trimmed, because the committed document indents its table rows and a fixture
  // that carried the indentation through would have to reproduce it in every
  // mutation regex -- which is a fixture detail, not part of what is under test.
  return rows.map((row) => row.trim()).join('\n');
}

/** A reference whose `pull` section carries the given per-backend table. */
async function referenceWithPullTable(table: string): Promise<string> {
  const document = await referenceFor(await advertisedTopics());
  const withTable = document.replace(
    /(### `rca-bench pull`\n\nFlags: [^\n]*\n)/,
    `$1\n${table}\n`,
  );
  if (withTable === document) throw new Error('the fixture could not place the table inside the pull section');
  return withTable;
}

/**
 * The per-backend table, which nothing read until pass 48.
 *
 * `check-cli-reference.mjs` compares the flag *set* of every command in both
 * directions, so a flag cannot drift out of the reference. What it never read is
 * the table in the `pull` section saying **which backend needs which flag** -- a
 * hand-written copy of `PULL_BACKEND_FLAGS` that could have said anything.
 *
 * The last test is the one that matters most. Comparing the two *sets* would
 * accept a table that moved a flag from `Required` to `Optional`: every flag is
 * still named, and only the column it sits in is wrong -- which is precisely the
 * error a reader would act on.
 */
describe('scripts/check-cli-reference.mjs · the per-backend table', () => {
  it('accepts the committed table', { timeout: 30_000 }, async () => {
    const result = await run(treeWith(await referenceWithPullTable(committedPullTable())));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CLI reference check PASSED');
  });

  it('refuses a backend the table leaves out', { timeout: 30_000 }, async () => {
    const table = committedPullTable().replace(/^\| `kubernetes` \|.*\n?/m, '');
    expect(table).not.toContain('`kubernetes`');

    const result = await run(treeWith(await referenceWithPullTable(table)));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('kubernetes');
  });

  it('refuses a backend the table invents', { timeout: 30_000 }, async () => {
    const table = `${committedPullTable()}\n| \`graphite\` | \`--base-url\` | \`--query\` |`;

    const result = await run(treeWith(await referenceWithPullTable(table)));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('graphite');
  });

  it('refuses a required flag the table never names', { timeout: 30_000 }, async () => {
    const table = committedPullTable().replace(
      /^\| `clickhouse` \|.*$/m,
      '| `clickhouse` | `--base-url --query --columns --user` | `--timestamp-unit --password --database --timeout-ms` |',
    );
    expect(table).not.toMatch(/`clickhouse`[^|]*\|[^|]*--limit/);

    const result = await run(treeWith(await referenceWithPullTable(table)));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--limit');
  });

  it('refuses a flag moved from required to optional, which a set comparison would accept', { timeout: 30_000 }, async () => {
    // Both columns still name `--service-label`; only the column changed. A gate
    // that compared the union of the two would stay green here, and a reader who
    // followed the document would omit a flag Loki refuses to run without.
    const table = committedPullTable().replace(
      /^\| `loki` \|.*$/m,
      '| `loki` | `--base-url --query --start --end --limit --direction` | `--service-label --timeout-ms` |',
    );

    const result = await run(treeWith(await referenceWithPullTable(table)));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--service-label');
  });
});
