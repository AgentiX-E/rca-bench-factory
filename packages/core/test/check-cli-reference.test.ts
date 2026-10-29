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
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/check-cli-reference.mjs',
];


/**
 * `scripts/check-cli-reference.mjs` — the **drift report**, not the empty table.
 *
 * `gates-are-testable.test.ts` already covers this gate's first exit: a
 * reference whose command table has been deleted or renamed. What it does not
 * cover is the exit that fires when the reference and the binary *disagree* --
 * the one the gate exists for, and the one whose diagnostic an operator
 * actually reads.
 *
 * ## The half that is easy to get wrong
 *
 * Every flag the binary advertises is looked up in the reference with a
 * trailing word boundary:
 *
 *   `new RegExp(`${flag}(?![\\w-])`)`
 *
 * A plain `includes` would let `--lead-ms-X` satisfy `--lead-ms`, so a renamed
 * flag would still look documented. The gate's own comment says so. A test that
 * only asserted "an undocumented flag fails" would pass against the broken
 * `includes` version too, because a flag that appears nowhere fails either way.
 * The test that distinguishes them is the one where the reference contains the
 * flag as a **prefix of a longer flag**.
 *
 * ## Why the fixture drives the real CLI
 *
 * The gate executes `packages/cli/dist/main.js` as a subprocess and reads its
 * `--help`. Neither side is restated in the gate, so the fixture cannot stub
 * one of them without the test becoming a test of the stub. The tree below
 * links the real build and supplies only the *reference document*, which is the
 * one input the gate treats as data.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'check-cli-reference.mjs';
const REFERENCE = resolve(ROOT, 'docs/cli-reference.md');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-cliref-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate and a `docs/cli-reference.md` the caller
 * writes, with the real CLI linked in.
 *
 * The link points at `packages/`, whose `cli/dist/main.js` is the shipped
 * binary. `node_modules/` comes along because the CLI resolves `core`, whose
 * own dependencies resolve from there.
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

/**
 * The child this file drives, waited for rather than blocked on.
 *
 * It used to be a synchronous spawn, and that was the defect: this file's cases
 * add up to more than a minute of *blocked event loop*, and the worker's RPC to
 * the main process -- whose deadline is 60 s -- expired without the loop turning
 * far enough to read the answer that had already arrived. Every test passed and
 * the run exited 1. `docs/audit/volume-09.md` records the controlled pair that
 * established it: nine seven-second synchronous children in one file reproduce
 * the failure, and the same nine waited for do not.
 */
function runNode(args: string[], cwd: string): Promise<Outcome> {
  return new Promise<Outcome>((settle) => {
    // `execFile` rather than a synchronous spawn, and `promisify` is deliberately
    // not used: `gate-sites-are-proven.test.ts` rule 7 reads the spawn calls in
    // this file to infer which scripts it drives, and a call spelled
    // `execFileAsync(...)` is not one it can see. A wrapper that hides the call
    // would have moved the evidence out of the scanner's reach.
    execFile(process.execPath, args, { encoding: 'utf8', cwd }, (error, stdout, stderr) => {
      if (error === null) {
        settle({ status: 0, stdout, stderr });
        return;
      }
      const code = (error as { code?: unknown }).code;
      // A child that never ran has no exit status, which is what a synchronous
      // spawn reported separately and a callback reports as an absent code.
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

describe('scripts/check-cli-reference.mjs · the drift report', () => {
  it('passes against the committed reference, so the negatives are not the only reachable state', { timeout: 30_000 }, async () => {
    // The precondition, and the reason the fixture below can be trusted to be
    // measuring the drift rather than the fixture: the real document satisfies
    // this gate on the real binary.
    const result = await runNode([resolve(ROOT, 'scripts', SCRIPT)], ROOT);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/CLI reference check PASSED \(\d+ commands, \d+ documented\)/);
    // And it really is comparing non-empty sets on both sides. A green run over
    // zero commands would satisfy every assertion above and mean nothing.
    expect((await advertisedTopics()).length).toBeGreaterThan(1);
    expect(readFileSync(REFERENCE, 'utf8')).toContain('## Implemented commands');
  });

  it('refuses a command the binary implements but the reference omits', { timeout: 30_000 }, async () => {
    // Build a reference that lists every topic except one. The omission is the
    // drift: a reader following the document cannot discover the command, and
    // nothing about the document says so.
    const topics = await advertisedTopics();
    const omitted = topics[0]!;
    const document = await referenceFor(topics.filter((t) => t !== omitted));

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLI reference check FAILED:');
    expect(result.stderr).toContain(`command '${omitted}' is implemented but not listed`);
  });

  it('refuses a section heading for a command the binary does not implement', { timeout: 30_000 }, async () => {
    // A documentation bug of its own: readers follow the heading and hit
    // `unknown command`. The gate's comment says so, and this is the assertion
    // that makes the claim true.
    const topics = await advertisedTopics();
    const document = `${await referenceFor(topics)}\n### \`rca-bench not-a-command\`\n\nProse.\n`;

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("documents 'not-a-command', which is not an implemented command");
  });

  it('refuses a reference that documents no flag at all', { timeout: 30_000 }, async () => {
    // The branch that makes the flag comparison total: a reference whose
    // sections exist but never name a flag used to pass, because a lookup that
    // finds nothing reports nothing. The document below lists every command and
    // describes each one, so the only thing missing is the flags -- which is
    // exactly the drift a reader cannot see and a gate must.
    //
    // The fixture writes a section per command. It wrote *no* sections until
    // the check became section-scoped, at which point "no section" -- a
    // different defect with a different message -- was reported instead, and
    // this test failed for a reason that had nothing to do with what it
    // asserts. That is the fixture being wrong rather than the check.
    const topics = await advertisedTopics();
    const document = await referenceFor(topics, { flags: false });

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    // Several commands now advertise a flag the reference never mentions, so
    // the report names them rather than the empty-flag branch.
    expect(result.stderr).toContain("is accepted by '");
    expect(result.stderr).toContain('but absent from docs/cli-reference.md');
  });

  it('reports every disagreement rather than stopping at the first', { timeout: 30_000 }, async () => {
    // The gate accumulates into `failures` and prints them all. One run should
    // be enough to fix a document, which is the same judgement the corpus
    // reader and `check-no-mock.mjs` both made.
    const topics = await advertisedTopics();
    const document = (await referenceFor(topics)).replace(/--[\w-]+/g, '--renamed');

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    const reported = result.stderr.split('\n').filter((line) => line.trim().startsWith('- '));
    expect(reported.length).toBeGreaterThan(1);
  });

  it('does not accept a longer flag as documentation of a shorter one', { timeout: 30_000 }, async () => {
    // **The assertion that distinguishes the real gate from `includes`.**
    //
    // The test takes one flag the binary advertises, `f`, and writes the
    // reference so that `f` appears **only** as the prefix of `f-X`. A gate
    // using `includes` accepts this; a gate using the trailing word boundary
    // does not, because `-` follows the flag's name.
    //
    // Every other test in this file passes under both implementations, which is
    // why this one exists: it is the only one that can fail when the boundary
    // is dropped, so it is the only one that guards the boundary.
    const flags = await advertisedFlags();
    expect(flags.length).toBeGreaterThan(0);
    const [topic, flag] = flags[0]!;

    const topics = await advertisedTopics();
    let document = await referenceFor(topics);
    // Remove the honest mention, then add the prefixed one back.
    document = document.split(flag).join(`${flag}-X`);
    expect(document).toContain(`${flag}-X`);
    expect(document).not.toMatch(new RegExp(`${escape(flag)}(?![\\w-])`));

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    // The failure names the topic that advertises it, and the flag itself.
    expect(result.stderr).toContain(`'${flag}' is accepted by '${topic}'`);
  });
});

/**
 * The two directions the first version of this gate did not read.
 *
 * Its header claims it catches "a command whose `--help` output and whose
 * reference section disagree about the flag set". Measured, it did not: the
 * lookup was `mentionsFlag(markdown, flag)`, over the **whole document**, and
 * only in the direction help → reference. So a flag could be listed under the
 * wrong command, or invented outright, and the gate stayed green. Both are
 * finding 153's shape -- the guard's subject was the document where it said
 * "section" -- and both are exhibited below rather than described.
 */
describe('scripts/check-cli-reference.mjs · the section, not the document', () => {
  it('refuses a flag documented under a command that does not accept it', { timeout: 30_000 }, async () => {
    // The fixture moves a real flag out of the section of the command that
    // advertises it and into the section of a command that does not. The
    // document still mentions the flag, so a whole-document lookup passes it;
    // the command whose `--help` lists it now has nothing under its own
    // heading, which is what a reader follows.
    const flags = await advertisedFlags();
    expect(flags.length).toBeGreaterThan(0);
    const [topic, flag] = flags[0]!;
    const topics = await advertisedTopics();
    const other = topics.find((t) => t !== topic);
    expect(other, 'only one command advertises flags, so this fixture has no subject').toBeDefined();

    let document = await referenceFor(topics);
    // Remove the honest mention, then write the flag under the other command.
    document = document.split(flag).join('--removed-entirely');
    document = document.replace(
      `### \`rca-bench ${other}\``,
      `### \`rca-bench ${other}\`\n\nThe flag \`${flag}\` is documented here, under the wrong command.`,
    );
    expect(document).toContain(flag);

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`'${flag}' is accepted by '${topic}'`);
  });

  it('refuses a flag no command accepts, documented in a command section', { timeout: 30_000 }, async () => {
    // The direction the gate never read at all: every check ran from the help
    // text towards the document, so a document that invents a flag -- or keeps
    // one after it was removed from the CLI -- was never contradicted. A
    // reference is read precisely when the flag is gone from the binary, which
    // is the moment this direction matters.
    const topics = await advertisedTopics();
    const document = `${await referenceFor(topics)}
A reader may also pass \`--not-a-real-flag <x>\`.\n`;

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--not-a-real-flag');
  });
});

describe('scripts/check-cli-reference.mjs · a command with no section of its own', () => {
  it('refuses a command the binary implements, listed, and left without a section', { timeout: 30_000 }, async () => {
    // A third state, and one the section-scoped check made new: the command is in
    // the reference's table, so a reader knows it exists, and its `--help` works,
    // but nothing under its own heading says what its flags do. The omission is
    // invisible from the table, which is why it needs its own message rather than
    // being folded into "absent from the document".
    const topics = await advertisedTopics();
    const orphaned = topics[1]!;
    const document = (await referenceFor(topics)).replace(
      new RegExp(`### \\\`rca-bench ${orphaned}\\\`[\\s\\S]*?(?=### |$)`),
      '',
    );
    expect(document).toContain(`| \`${orphaned}\` |`);
    expect(document).not.toContain(`### \`rca-bench ${orphaned}\``);

    const result = await run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`command '${orphaned}' has no`);
  });
});

/** Every flag the binary advertises, as `[topic, flag]`, read from its `--help`. */
async function advertisedFlags(): Promise<[string, string][]> {
  const found: [string, string][] = [];
  for (const topic of await advertisedTopics()) {
    const help = (await runNode([resolve(ROOT, 'packages/cli/dist/main.js'), topic, '--help'], ROOT)).stdout;
    for (const match of help.matchAll(/^ {2}(--[\w-]+)/gm)) found.push([topic, match[1]!]);
  }
  return found;
}

function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A reference document that the gate accepts, built around a given command list.
 *
 * The flag lists are read from each command's real `--help` rather than
 * invented, so the only thing the caller varies is the *structure* -- which
 * commands are listed, and whether the flags are written down at all.
 */
async function referenceFor(topics: string[], options: { flags?: boolean } = {}): Promise<string> {
  const lines = ['# CLI reference', '', '## Implemented commands', '', '| Command | What it does |', '| --- | --- |'];
  for (const topic of topics) lines.push(`| \`${topic}\` | a command |`);
  lines.push('');
  for (const topic of topics) {
    lines.push(`### \`rca-bench ${topic}\``, '');
    if (options.flags === false) {
      // A section that says what the command does and never names a flag. It
      // used to write no section at all, which stopped being the same thing
      // once the check became section-scoped: "no section" and "a section with
      // no flags" are now two different defects with two different messages.
      lines.push(`Runs ${topic}.`, '');
      continue;
    }
    const help = (await runNode([resolve(ROOT, 'packages/cli/dist/main.js'), topic, '--help'], ROOT)).stdout;
    const flags = [...help.matchAll(/^ {2}(--[\w-]+)/gm)].map((m) => m[1]!);
    lines.push(`Flags: ${flags.map((f) => `\`${f}\``).join(', ')}`, '');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The `pull` section's per-backend table moved to
 * `cli-reference-backend-table.test.ts`.
 *
 * It was five more cases here, and every case in this file spawns the gate, which
 * imports core's built `dist/index.js` -- about 2.3 s each. Fourteen cases in one
 * file is ~32 s of serial work, and CI failed with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` **while every test passed**:
 * the worker's RPC to the main process timed out under the accumulated update
 * traffic, and vitest exits non-zero for an unhandled error even when the suite is
 * green. Locally the same run passed, because this machine is faster.
 *
 * A second test file is the fix rather than a wider timeout -- it restores the
 * parallelism the extra cases were taking away, and it costs nothing else.
 */
